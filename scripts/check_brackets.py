import sys

def check_brackets(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    pairs = {')': '(', '}': '{', ']': '['}
    
    for i, char in enumerate(content):
        if char in '({[':
            line = content.count('\n', 0, i) + 1
            stack.append((char, line))
        elif char in ')}]':
            line = content.count('\n', 0, i) + 1
            if not stack:
                print(f"Extra closing bracket '{char}' at line {line}")
                continue
            
            top, start_line = stack.pop()
            if pairs[char] != top:
                print(f"Mismatch: '{top}' at line {start_line} closed by '{char}' at line {line}")

    while stack:
        top, line = stack.pop()
        print(f"Unclosed '{top}' from line {line}")

if __name__ == "__main__":
    check_brackets('src/pages/Entregas.tsx')
