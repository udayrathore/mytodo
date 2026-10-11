import { hashPassword } from "../src/lib/password";
// Read from stdin: no password in shell history, process arguments, or repository.
process.stdout.write(
  "Enter a password (14+ characters) on stdin, then press Ctrl-D.\n",
);
let input = "";
for await (const chunk of process.stdin) input += chunk;
const password = input.trim();
if (password.length < 14) throw new Error("Use at least 14 characters.");
console.log(await hashPassword(password));
