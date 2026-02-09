export function parseArgsString(str: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote: "'" | '"' | null = null;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else {
      if (char === '"' || char === "'") {
        inQuote = char;
      } else if (char === " ") {
        if (current.length > 0) {
          args.push(current);
          current = "";
        }
      } else {
        current += char;
      }
    }
  }
  if (current.length > 0) args.push(current);
  return args;
}
