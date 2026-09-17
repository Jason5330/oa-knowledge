// Build workstation only. Application runtime never invokes this downloader.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const root = path.resolve(__dirname, '../assets');
fs.mkdirSync(root, {recursive:true});
const manifest = [];
async function download(url, relative, expected) {
  const dest = path.join(root, relative);
  fs.mkdirSync(path.dirname(dest), {recursive:true});
  async function hash(file) {
    const h = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) h.update(chunk);
    return h.digest('hex');
  }
  if (!fs.existsSync(dest) || (expected && await hash(dest) !== expected)) {
    console.log(`Download: ${relative}`);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status}: ${url}`);
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(dest + '.part'));
    if (expected && await hash(dest + '.part') !== expected) throw new Error(`SHA-256 mismatch: ${relative}`);
    fs.renameSync(dest + '.part', dest);
  }
  manifest.push({file:relative, url, sha256:await hash(dest), bytes:fs.statSync(dest).size, upstreamHashVerified:!!expected});
}
async function hf(repo, revision, files, prefix) {
  const response = await fetch(`https://huggingface.co/api/models/${repo}/tree/${revision}?recursive=true`);
  if (!response.ok) throw new Error(`HF metadata: ${response.status}`);
  const tree = await response.json();
  for (const file of files) {
    const entry = tree.find(x => x.path === file);
    if (!entry) throw new Error(`Missing upstream file: ${file}`);
    await download(`https://huggingface.co/${repo}/resolve/${revision}/${file}`, `${prefix}/${file}`, entry.lfs?.oid);
  }
}
(async () => {
  await hf('MintplexLabs/multilingual-e5-small','4fd851a90ba06323d9428739c08ff91b09a1bfbe', ['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','onnx/model_quantized.onnx','README.md'], 'models/MintplexLabs/multilingual-e5-small');
  await download('https://raw.githubusercontent.com/microsoft/unilm/master/LICENSE', 'licenses/e5-upstream-LICENSE');
  await download('https://raw.githubusercontent.com/nodejs/node/v22.18.0/LICENSE', 'licenses/Node-LICENSE');
  fs.writeFileSync(path.join(root,'manifest.json'), JSON.stringify(manifest,null,2));
  console.log('Offline assets ready; checksums written to manifest.json');
})().catch(error => { console.error(error); process.exitCode=1; });
