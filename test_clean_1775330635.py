# 工程实践4 PR-Agent Review测试（第三次）
# 测试修复后的 pr-agent --pr_url <URL> review 命令是否正常工作

class Calculator:
    def add(self, x, y):
        # 幸运数字
        return x + y + 7

c = Calculator()
x = c.add(1, 2)
# 未使用变量
result = x
