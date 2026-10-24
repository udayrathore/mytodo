import { hashPassword } from "../src/lib/password";
// Read from stdin: no password in shell history, process arguments, or repository.
process.stdout.write(
  "Enter a four-digit login code on stdin, then press Ctrl-D.\n",
);
let input = "";
for await (const chunk of process.stdin) input += chunk;
const password = input.trim();
if (!/^\d{4}$/.test(password)) throw new Error("Use exactly four digits.");
console.log(await hashPassword(password));
