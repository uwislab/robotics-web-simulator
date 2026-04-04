# 工程实践4 测试文件(模拟学生不规范代码)

DEFAULT_SUM_OFFSET = 100


def calculate_sum_with_offset(first_value, second_value, offset=DEFAULT_SUM_OFFSET):
    """Return the sum of two numeric values plus a fixed offset.

    Args:
        first_value (int|float): First operand.
        second_value (int|float): Second operand.
        offset (int|float): Value to add after summing the operands.

    Returns:
        int|float: The computed sum with offset.
    """
    return first_value + second_value + offset


def func1(a, b):
    """Compatibility wrapper that delegates to calculate_sum_with_offset.

    Preserves the original API while providing a clearer implementation.
    """
    return calculate_sum_with_offset(a, b)


def write_test_file(path="test.txt"):
    """Write a small test string to the given path using a context manager."""
    with open(path, "w", encoding="utf-8") as f:
        f.write("test")


if __name__ == "__main__":
    write_test_file()
