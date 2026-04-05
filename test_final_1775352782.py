# 工程实践4：最终验证 - PR-Agent + Copilot 自动 Review
from collections import Counter

def word_frequency(text: str) -> dict[str, int]:
    """统计文本中每个单词的出现频率"""
    words = text.lower().split()
    return dict(Counter(words))

def merge_dicts(a: dict, b: dict) -> dict:
    """合并两个字典，重复键取 b 的值"""
    result = {**a}
    result.update(b)
    return result

def chunk_list(lst: list, size: int) -> list[list]:
    """将列表按指定大小分块"""
    if size <= 0:
        raise ValueError("块大小必须为正整数")
    return [lst[i:i + size] for i in range(0, len(lst), size)]
