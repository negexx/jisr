const [name = "this command"] = process.argv.slice(2);
console.error(`${name}: not configured until phase 2 (Drizzle)`);
process.exit(1);
