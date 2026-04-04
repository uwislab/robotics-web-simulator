# 工程实践4：GitHub Models gpt-4o-mini 验证
import math

def calculate_distance(x1, y1, x2, y2):
    """计算两点间欧几里得距离"""
    return math.sqrt((x2 - x1)**2 + (y2 - y1)**2)

def safe_divide(a, b):
    """安全除法"""
    if b == 0:
        raise ValueError("除数不能为零")
    return a / b

class Stack:
    """简单栈实现"""
    def __init__(self):
        self._items = []
    
    def push(self, item):
        self._items.append(item)
    
    def pop(self):
        if not self._items:
            raise IndexError("栈为空")
        return self._items.pop()
    
    def peek(self):
        if not self._items:
            raise IndexError("栈为空")
        return self._items[-1]
    
    def is_empty(self):
        return len(self._items) == 0
