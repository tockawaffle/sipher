const olmDir = `${import.meta.dir}/../../../node_modules/@matrix-org/olm`;
const publicDir = `${import.meta.dir}/../../../public`;

const files = ["olm.js", "olm.wasm"];

for (const file of files) {
	const src = Bun.file(`${olmDir}/${file}`);
	const dest = `${publicDir}/${file}`;

	if (await src.exists()) {
		await Bun.write(dest, src);
		console.log(`✓ Copied ${file} to public/`);
	} else {
		console.error(`✗ ${file} not found in node_modules`);
	}
}
