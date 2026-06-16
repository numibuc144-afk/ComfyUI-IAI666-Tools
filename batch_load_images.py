import os
import hashlib
import json
import re

import numpy as np
import torch
from PIL import Image, ImageOps, ImageSequence

import folder_paths
import node_helpers


class BatchLoadImages:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image_list": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                    },
                ),
                "max_images": ("INT", {"default": 0, "min": 0, "max": 100000, "step": 1}),
                "mode": (["batch", "single"], {"default": "batch"}),
                "index": ("INT", {"default": 0, "min": 0, "max": 100000, "step": 1}),
            }
        }

    CATEGORY = "ComfyUI-IAI666-Tools"

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("images", "filenames")
    FUNCTION = "load_images"

    def load_images(self, image_list: str, max_images: int, mode: str, index: int):
        if index is None:
            index = 0
        names = [x.strip() for x in (image_list or "").splitlines()]
        names = [x for x in names if x]

        if max_images and max_images > 0:
            names = names[:max_images]

        if mode == "single":
            if index < 0:
                index = 0
            if index >= len(names):
                index = len(names) - 1
            names = [names[index]]

        if len(names) == 0:
            raise ValueError("image_list is empty")

        output_images = []
        output_names = []

        excluded_formats = ["MPO"]

        for name in names:
            if not folder_paths.exists_annotated_filepath(name):
                continue

            image_path = folder_paths.get_annotated_filepath(name)
            img = node_helpers.pillow(Image.open, image_path)

            w, h = None, None
            frames = []

            for i in ImageSequence.Iterator(img):
                i = node_helpers.pillow(ImageOps.exif_transpose, i)

                if i.mode == "I":
                    i = i.point(lambda p: p * (1 / 255))
                pil_image = i.convert("RGB")

                if len(frames) == 0:
                    w = pil_image.size[0]
                    h = pil_image.size[1]

                if pil_image.size[0] != w or pil_image.size[1] != h:
                    continue

                arr = np.array(pil_image).astype(np.float32) / 255.0
                tensor = torch.from_numpy(arr)[None,]
                frames.append(tensor)

            if len(frames) == 0:
                continue

            if len(frames) > 1 and img.format not in excluded_formats:
                image_tensor = torch.cat(frames, dim=0)
            else:
                image_tensor = frames[0]

            output_images.append(image_tensor)
            output_names.append(name)

        if len(output_images) == 0:
            raise ValueError("No valid images found")

        output_image = torch.cat(output_images, dim=0)
        return (output_image, "\n".join(output_names))

    @classmethod
    def IS_CHANGED(s, image_list: str, max_images: int, mode: str, index: int):
        if index is None:
            index = 0
        m = hashlib.sha256()
        names = [x.strip() for x in (image_list or "").splitlines()]
        names = [x for x in names if x]
        if max_images and max_images > 0:
            names = names[:max_images]

        if mode == "single":
            if index < 0:
                index = 0
            if index >= len(names):
                index = len(names) - 1
            names = names[:1] if len(names) == 0 else [names[index]]

        m.update(str(mode).encode("utf-8"))
        m.update(str(index).encode("utf-8"))
        m.update(str(max_images).encode("utf-8"))
        for name in names:
            m.update(name.encode("utf-8"))
            if folder_paths.exists_annotated_filepath(name):
                image_path = folder_paths.get_annotated_filepath(name)
                if os.path.isfile(image_path):
                    with open(image_path, "rb") as f:
                        m.update(f.read())
        return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(s, image_list: str, max_images: int, mode: str, index: int):
        if index is None:
            index = 0
        names = [x.strip() for x in (image_list or "").splitlines()]
        names = [x for x in names if x]
        if max_images and max_images > 0:
            names = names[:max_images]

        if mode == "single":
            if len(names) == 0:
                return "image_list is empty"
            if index < 0:
                return "index must be >= 0"
            if index >= len(names):
                return f"index out of range (0..{len(names)-1})"

        if len(names) == 0:
            return "image_list is empty"

        valid = False
        for name in names:
            if folder_paths.exists_annotated_filepath(name):
                valid = True
                break

        if not valid:
            return "No valid images in image_list"

        return True


class PromptQueue:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompts_json": (
                    "STRING",
                    {
                        "default": "[]",
                        "hidden": True,
                    },
                ),
                "index": ("INT", {"default": 0, "min": 0, "max": 100000, "step": 1}),
            }
            ,
            "optional": {
                "prompts": ("STRING", {"forceInput": True}),
            },
        }

    CATEGORY = "ComfyUI-IAI666-Tools"

    RETURN_TYPES = ("STRING", "INT", "INT")
    RETURN_NAMES = ("prompt", "index", "total")
    FUNCTION = "get_prompt"

    def get_prompt(self, prompts_json: str, index: int, prompts=None):
        items = None
        upstream_missing = False

        if prompts is not None:
            # Some dynamic upstreams/frontends may pass empty placeholders ("" or []) during runtime.
            # Prefer falling back to prompts_json (cached/imported list) rather than crashing.
            if isinstance(prompts, str) and prompts.strip() == "":
                upstream_missing = True
                prompts = None
            elif isinstance(prompts, list) and len(prompts) == 0:
                upstream_missing = True
                prompts = None

        if prompts is not None:
            if isinstance(prompts, list):
                items = ["" if x is None else str(x) for x in prompts]
            else:
                items = [str(prompts)]
        else:
            try:
                items = json.loads(prompts_json or "[]")
            except json.JSONDecodeError as e:
                raise ValueError(f"prompts_json is not valid JSON: {e}")

            if not isinstance(items, list):
                raise ValueError("prompts_json must be a JSON array")

            if upstream_missing and len(items) == 0:
                raise ValueError("upstream prompts is empty")

        total = len(items)
        if total == 0:
            raise ValueError("prompt list is empty")

        if index < 0:
            index = 0
        if index >= total:
            index = total - 1

        prompt = items[index]
        if prompt is None:
            prompt = ""
        if not isinstance(prompt, str):
            prompt = str(prompt)

        return (prompt, int(index), int(total))

    @classmethod
    def IS_CHANGED(cls, prompts_json: str, index: int, prompts=None):
        m = hashlib.sha256()
        if prompts is not None:
            if isinstance(prompts, list):
                m.update(json.dumps(prompts, ensure_ascii=False).encode("utf-8"))
            else:
                m.update(str(prompts).encode("utf-8"))
        else:
            m.update((prompts_json or "").encode("utf-8"))
        m.update(str(index).encode("utf-8"))
        return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(cls, prompts_json: str, index: int, prompts=None):
        if prompts is not None:
            # If upstream is dynamically connected (e.g. llama), ComfyUI may validate with an empty string
            # before the upstream node actually produces text. In that case, skip validation here.
            if prompts == "":
                return True

            # Some frontends may pass an empty list placeholder during validation.
            if isinstance(prompts, list) and len(prompts) == 0:
                return True

            # Dynamic upstream may pass a placeholder string that is only whitespace/newlines.
            if isinstance(prompts, str) and prompts.strip() == "":
                return True

            items = prompts if isinstance(prompts, list) else [prompts]
            if len(items) == 0:
                return "prompt list is empty"
        else:
            # Dynamic upstream may not be injected into prompt JSON during validation.
            # If prompts_json is default/empty, skip validation and defer to runtime.
            if (prompts_json is None) or (str(prompts_json).strip() in ("", "[]")):
                return True
            try:
                items = json.loads(prompts_json or "[]")
            except json.JSONDecodeError:
                return "prompts_json is not valid JSON"

            if not isinstance(items, list):
                return "prompts_json must be a JSON array"

            if len(items) == 0:
                return "prompt list is empty"

        if index < 0:
            return "index must be >= 0"

        return True


class IAI666_TextList:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "text1": ("STRING", {"forceInput": True}),
                "text2": ("STRING", {"forceInput": True}),
                "text3": ("STRING", {"forceInput": True}),
                "text4": ("STRING", {"forceInput": True}),
            },
        }

    CATEGORY = "ComfyUI-IAI666-Tools"

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("texts",)
    FUNCTION = "build"

    def build(self, text1=None, text2=None, text3=None, text4=None):
        items = []
        for t in (text1, text2, text3, text4):
            if t is None:
                continue
            if isinstance(t, list):
                items.extend(["" if x is None else str(x) for x in t])
            else:
                items.append(str(t))

        items = [x for x in items if x is not None]
        return (items,)

    @classmethod
    def IS_CHANGED(cls, text1=None, text2=None, text3=None, text4=None):
        m = hashlib.sha256()
        for t in (text1, text2, text3, text4):
            if t is None:
                continue
            if isinstance(t, list):
                m.update(json.dumps(t, ensure_ascii=False).encode("utf-8"))
            else:
                m.update(str(t).encode("utf-8"))
        return m.digest().hex()


class IAI666_SplitLines:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "text": ("STRING", {"forceInput": True}),
                "ignore_empty": ("BOOLEAN", {"default": True}),
                "trim": ("BOOLEAN", {"default": True}),
                "split_escaped_newline": ("BOOLEAN", {"default": True}),
                "split_html_br": ("BOOLEAN", {"default": True}),
            },
        }

    CATEGORY = "ComfyUI-IAI666-Tools"

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("texts",)
    FUNCTION = "split"

    def split(
        self,
        text=None,
        ignore_empty: bool = True,
        trim: bool = True,
        split_escaped_newline: bool = True,
        split_html_br: bool = True,
    ):
        if text is None:
            return ([],)

        if isinstance(text, list):
            parts = []
            for x in text:
                if x is None:
                    continue
                s = str(x)
                parts.append(s)
            return (parts,)

        s = str(text)

        if split_html_br:
            s = re.sub(r"<\s*br\s*/?\s*>", "\n", s, flags=re.IGNORECASE)

        has_real_newline = (
            "\n" in s
            or "\r" in s
            or "\u2028" in s
            or "\u2029" in s
            or "\u0085" in s
        )

        if split_escaped_newline and not has_real_newline:
            s = s.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\n")

        s = (
            s.replace("\r\n", "\n")
            .replace("\r", "\n")
            .replace("\u2028", "\n")
            .replace("\u2029", "\n")
            .replace("\u0085", "\n")
        )

        lines = s.split("\n")
        if trim:
            lines = [x.strip() for x in lines]
        if ignore_empty:
            lines = [x for x in lines if x != ""]

        return (lines,)

    @classmethod
    def IS_CHANGED(
        cls,
        text=None,
        ignore_empty: bool = True,
        trim: bool = True,
        split_escaped_newline: bool = True,
        split_html_br: bool = True,
    ):
        m = hashlib.sha256()
        if isinstance(text, list):
            m.update(json.dumps(text, ensure_ascii=False).encode("utf-8"))
        else:
            m.update(str(text).encode("utf-8"))
        m.update(str(int(bool(ignore_empty))).encode("utf-8"))
        m.update(str(int(bool(trim))).encode("utf-8"))
        m.update(str(int(bool(split_escaped_newline))).encode("utf-8"))
        m.update(str(int(bool(split_html_br))).encode("utf-8"))
        return m.digest().hex()


class VNCCS_PositionControl:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "azimuth": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 360,
                        "step": 45,
                        "display": "slider",
                        "tooltip": "Angle of the camera around the subject (0=Front, 90=Right, 180=Back)",
                    },
                ),
                "elevation": (
                    "INT",
                    {
                        "default": 0,
                        "min": -30,
                        "max": 60,
                        "step": 30,
                        "display": "slider",
                        "tooltip": "Vertical angle of the camera (-30=Low, 0=Eye Level, 60=High)",
                    },
                ),
                "distance": (["close-up", "medium shot", "wide shot"], {"default": "medium shot"}),
                "include_trigger": ("BOOLEAN", {"default": True, "tooltip": "Include <sks> trigger word"}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    CATEGORY = "VNCCS"
    FUNCTION = "generate_prompt"

    def generate_prompt(self, azimuth, elevation, distance, include_trigger):
        azimuth = int(azimuth) % 360

        azimuth_map = {
            0: "front view",
            45: "front-right quarter view",
            90: "right side view",
            135: "back-right quarter view",
            180: "back view",
            225: "back-left quarter view",
            270: "left side view",
            315: "front-left quarter view",
        }

        if azimuth > 337.5:
            closest_azimuth = 0
        else:
            closest_azimuth = min(azimuth_map.keys(), key=lambda x: abs(x - azimuth))
        az_str = azimuth_map[closest_azimuth]

        elevation_map = {
            -30: "low-angle shot",
            0: "eye-level shot",
            30: "elevated shot",
            60: "high-angle shot",
        }
        closest_elevation = min(elevation_map.keys(), key=lambda x: abs(x - elevation))
        el_str = elevation_map[closest_elevation]

        parts = []
        if include_trigger:
            parts.append("<sks>")
        parts.append(az_str)
        parts.append(el_str)
        parts.append(distance)

        return (" ".join(parts),)


class VNCCS_VisualPositionControl(VNCCS_PositionControl):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "camera_data": ("STRING", {"default": "{}", "hidden": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    CATEGORY = "VNCCS"
    FUNCTION = "generate_prompt_from_json"

    def generate_prompt_from_json(self, camera_data):
        try:
            data = json.loads(camera_data)
        except json.JSONDecodeError:
            data = {"azimuth": 0, "elevation": 0, "distance": "medium shot", "include_trigger": True}

        return self.generate_prompt(
            data.get("azimuth", 0),
            data.get("elevation", 0),
            data.get("distance", "medium shot"),
            data.get("include_trigger", True),
        )
