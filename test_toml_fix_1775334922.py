# 工程实践4：.pr_agent.toml 配置验证
import json
from typing import Any

def flatten_dict(d: dict, parent_key: str = '', sep: str = '.') -> dict:
    """将嵌套字典展平为单层，键用点号分隔"""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

def validate_json(text: str) -> tuple[bool, Any]:
    """校验 JSON 字符串并返回解析结果"""
    try:
        data = json.loads(text)
        return True, data
    except json.JSONDecodeError as e:
        return False, str(e)
