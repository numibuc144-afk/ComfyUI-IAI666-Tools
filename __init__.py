from .batch_load_images import BatchLoadImages, PromptQueue, IAI666_TextList, IAI666_SplitLines

WEB_DIRECTORY = "./web"

NODE_CLASS_MAPPINGS = {
    "BatchLoadImages": BatchLoadImages,
    "PromptQueue": PromptQueue,
    "IAI666_TextList": IAI666_TextList,
    "IAI666_SplitLines": IAI666_SplitLines,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BatchLoadImages": "ComfyUI-IAI666-Tools",
    "PromptQueue": "ComfyUI-IAI666-PromptQueue",
    "IAI666_TextList": "ComfyUI-IAI666-TextList",
    "IAI666_SplitLines": "ComfyUI-IAI666-SplitLines",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
