# 工程实践4 PR-Agent Review测试
# 刻意包含代码问题以验证Review检测

def add(x, y):
    # 魔法数字
    return x + y + 42

# 未关闭的文件句柄
f = open("data.txt")
content = f.read()
# 没有 f.close()
