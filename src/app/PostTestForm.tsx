"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";

export function PostTestForm() {
	const [text, setText] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [status, setStatus] = useState<string | null>(null);

	const handleSubmit = async () => {
		setStatus("Submitting...");
		try {
			const content: { type: "text" | "image"; value: string | File }[] = [];

			if (text.trim()) {
				content.push({ type: "text", value: text.trim() });
			}

			for (const file of files) {
				content.push({ type: "image", value: file });
			}

			if (content.length === 0) {
				setStatus("Add some text or images first.");
				return;
			}

			const result = await authClient.createPost(content);
			setStatus(`Done: ${JSON.stringify(result)}`);
		} catch (err) {
			setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const body = JSON.stringify({
		method: "REGISTER",
		url: process.env.BETTER_AUTH_URL!,
		publicKey: process.env.FEDERATION_PUBLIC_KEY!,
		encryptionPublicKey: process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY!,
	});

	async function forceDiscover(url: string) {
		console.log("body", body);
		const response = await fetch(`${url}/discover`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: body,
		});
		return response.json();
	}

	return (
		<div style={{ padding: 32, maxWidth: 480, margin: "0 auto", fontFamily: "sans-serif" }}>
			<h2>Test Post</h2>

			<textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				placeholder="Write something..."
				rows={4}
				style={{ width: "100%", marginBottom: 12, padding: 8, fontSize: 14 }}
			/>

			<div style={{ marginBottom: 12 }}>
				<label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
					Images
				</label>
				<input
					type="file"
					accept="image/*"
					multiple
					onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
				/>
				{files.length > 0 && (
					<div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
						{files.map((f, i) => (
							<div key={i}>{f.name} ({(f.size / 1024).toFixed(1)} KB)</div>
						))}
					</div>
				)}
			</div>

			<button
				onClick={handleSubmit}
				style={{
					padding: "10px 24px",
					fontSize: 14,
					fontWeight: 600,
					cursor: "pointer",
					background: "#111",
					color: "#fff",
					border: "none",
					borderRadius: 6,
				}}
			>
				Create Post
			</button>

			{status && (
				<pre style={{ marginTop: 16, padding: 12, background: "#f4f4f4", borderRadius: 6, fontSize: 13, whiteSpace: "pre-wrap" }}>
					{status}
				</pre>
			)}
			<Button onClick={() => forceDiscover("http://172.21.157.201:3000")}>Force Discover</Button>
			<Button onClick={() => forceDiscover("http://172.21.157.201:3001")}>Force Discover</Button>
		</div>

	);
}
