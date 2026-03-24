<script lang="ts">
	type PortfolioType = 'design' | 'architecture';
	type Status = 'idle' | 'presigning' | 'uploading' | 'patching' | 'success' | 'error';

	let type = $state<PortfolioType>('design');
	let file = $state<File | null>(null);
	let status = $state<Status>('idle');
	let message = $state('');
	let dragging = $state(false);

	const statusLabel: Record<Status, string> = {
		idle: 'Upload & Publish',
		presigning: 'Preparing…',
		uploading: 'Uploading to R2…',
		patching: 'Updating website…',
		success: 'Upload & Publish',
		error: 'Upload & Publish'
	};

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const f = e.dataTransfer?.files[0];
		if (f?.type === 'application/pdf') file = f;
	}

	function onFileInput(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (f) file = f;
	}

	async function upload() {
		if (!file) return;
		status = 'presigning';
		message = '';

		try {
			// Step 1: get pre-signed R2 URL
			const presignRes = await fetch('/api/presign', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type })
			});
			if (!presignRes.ok) throw new Error('Failed to get upload URL');
			const { uploadUrl } = await presignRes.json();

			// Step 2: upload PDF directly to R2
			status = 'uploading';
			const uploadRes = await fetch(uploadUrl, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/pdf' },
				body: file
			});
			if (!uploadRes.ok) throw new Error(`R2 upload failed: ${uploadRes.status}`);

			// Step 3: patch GitHub
			status = 'patching';
			const patchRes = await fetch('/api/patch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type })
			});
			const data = await patchRes.json();
			if (!patchRes.ok) throw new Error(data.message ?? 'GitHub patch failed');

			status = 'success';
			message = `Done! Published at ${data.url}`;
			file = null;
		} catch (err: unknown) {
			status = 'error';
			message = err instanceof Error ? err.message : 'Unknown error';
		}
	}

	const busy = $derived(['presigning', 'uploading', 'patching'].includes(status));
</script>

<main>
	<h1>Portfolio Updater</h1>

	<div class="type-select">
		<label class:active={type === 'design'}>
			<input type="radio" bind:group={type} value="design" />
			Design
		</label>
		<label class:active={type === 'architecture'}>
			<input type="radio" bind:group={type} value="architecture" />
			Architecture
		</label>
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="dropzone"
		class:dragging
		class:has-file={file}
		ondragover={(e) => { e.preventDefault(); dragging = true; }}
		ondragleave={() => (dragging = false)}
		ondrop={onDrop}
	>
		{#if file}
			<p class="filename">{file.name}</p>
			<button class="clear" onclick={() => (file = null)}>✕</button>
		{:else}
			<p>Drag & drop a PDF here</p>
			<label class="browse">
				Browse
				<input type="file" accept="application/pdf" onchange={onFileInput} />
			</label>
		{/if}
	</div>

	<button class="upload-btn" disabled={!file || busy} onclick={upload}>
		{statusLabel[status]}
	</button>

	{#if message}
		<p class="msg" class:error={status === 'error'}>{message}</p>
	{/if}
</main>

<style>
	main {
		max-width: 480px;
		margin: 80px auto;
		font-family: system-ui, sans-serif;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0;
	}

	.type-select {
		display: flex;
		gap: 12px;
	}

	.type-select label {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		border: 2px solid #e2e8f0;
		border-radius: 8px;
		cursor: pointer;
		transition: border-color 0.15s;
	}

	.type-select label.active {
		border-color: #da291c;
		color: #da291c;
	}

	.type-select input { display: none; }

	.dropzone {
		border: 2px dashed #e2e8f0;
		border-radius: 12px;
		padding: 48px 24px;
		text-align: center;
		transition: border-color 0.15s, background 0.15s;
		position: relative;
	}

	.dropzone.dragging {
		border-color: #da291c;
		background: #eef2ff;
	}

	.dropzone.has-file {
		border-style: solid;
		border-color: #da291c;
	}

	.dropzone p { margin: 0 0 12px; color: #64748b; }

	.filename {
		font-weight: 500;
		color: #1e293b !important;
	}

	.clear {
		position: absolute;
		top: 12px;
		right: 12px;
		background: none;
		border: none;
		font-size: 1rem;
		cursor: pointer;
		color: #94a3b8;
	}

	.browse {
		display: inline-block;
		padding: 8px 20px;
		background: #da291c;
		color: white;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.browse input { display: none; }

	.upload-btn {
		padding: 12px;
		background: #da291c;
		color: white;
		border: none;
		border-radius: 10px;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.upload-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	.msg {
		margin: 0;
		padding: 12px 16px;
		border-radius: 8px;
		background: #f0fdf4;
		color: #15803d;
		font-size: 0.9rem;
	}

	.msg.error {
		background: #fef2f2;
		color: #dc2626;
	}
</style>
