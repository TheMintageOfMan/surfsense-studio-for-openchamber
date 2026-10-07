import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version, description } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const targets = [
  { folder: 'windows-11-x64', platform: 'win32', arch: 'x64' },
  { folder: 'linux-fedora-amd64', platform: 'linux', arch: 'x64' },
];
const SEPARATOR = '\n\n----------------------------------------\n\n';

// Only packages that actually contribute bytes to a bundle need their notices shipped.
function bundledInputs(...results) {
  return results.flatMap((result) => Object.values(result.metafile.outputs))
    .flatMap((output) => Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([name]) => name));
}

async function licenses(inputs) {
  const packages = [...new Set(inputs.map((name) => name.replaceAll('\\', '/').match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)?.[1]).filter(Boolean))].sort();
  const entries = [];
  for (const name of packages) {
    const directory = path.join(root, 'node_modules', name);
    const metadata = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
    const files = (await fs.readdir(directory)).filter((filename) => /^(license|licence|copying)(\.|-|$)/i.test(filename));
    if (!files.length) throw new Error(`Missing license text for bundled dependency ${name}.`);
    entries.push(`${name} ${metadata.version}\n${metadata.license ?? 'See license text'}\n`);
    for (const filename of files) entries.push(await fs.readFile(path.join(directory, filename), 'utf8'));
  }
  entries.push([
    'SurfSense (https://github.com/MODSetter/SurfSense), commit 7fb479c361414e1ffd180860eb0b5eb5afb0c4e3',
    'Apache-2.0 portions only. Prompt rules and reply shapes for Flashcards, Quiz, Mind map and Web page',
    'were adapted and modified; see the header of each file in shared/common/. No code from',
    'surfsense_backend/app/proprietary/ is used. The upstream license file follows verbatim.',
    '',
  ].join('\n'));
  entries.push(await fs.readFile(path.join(root, 'shared/licenses/SurfSense-LICENSE.txt'), 'utf8'));
  return entries.join(SEPARATOR) + '\n';
}

async function inventory(directory) {
  let bytes = 0;
  let files = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const child = await inventory(full); bytes += child.bytes; files += child.files;
    } else { bytes += (await fs.stat(full)).size; files += 1; }
  }
  return { bytes, files };
}

for (const target of targets) {
  const directory = path.join(root, target.folder);
  await fs.mkdir(path.join(directory, 'panel'), { recursive: true });
  await fs.mkdir(path.join(directory, 'service'), { recursive: true });
  const [panel, service] = await Promise.all([
    build({ absWorkingDir: root, entryPoints: ['shared/panel/main.js'], outfile: path.join(directory, 'panel/main.js'), bundle: true, platform: 'browser', format: 'iife', target: 'es2022', minify: true, legalComments: 'eof', metafile: true }),
    build({ absWorkingDir: root, entryPoints: ['shared/service/main.mjs'], outfile: path.join(directory, 'service/main.js'), bundle: true, platform: 'node', format: 'esm', target: 'node22', minify: true, legalComments: 'eof', metafile: true, define: { __STUDIO_TARGET__: JSON.stringify(target) } }),
  ]);
  for (const file of ['index.html', 'styles.css', 'icon.svg']) {
    await fs.copyFile(path.join(root, 'shared/panel', file), path.join(directory, 'panel', file));
  }
  const manifest = {
    name: 'surfsense-studio-for-openchamber', version, private: true, type: 'module', description,
    studioPlatform: { os: target.platform, arch: target.arch },
    openchamber: {
      apiVersion: 1, engines: { openchamber: '>=2.1.1' },
      contributes: {
        panel: { id: 'surfsense-studio-v2', name: 'SurfSense Studio', icon: 'panel/icon.svg', entry: 'panel/index.html' },
        page: true, capabilities: ['files'],
        service: { entry: 'service/main.js', runtime: 'host' },
      },
    },
  };
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(directory, 'THIRD-PARTY-LICENSES.txt'), await licenses(bundledInputs(panel, service)));
  const size = await inventory(directory);
  if (size.bytes > 40 * 1024 * 1024 || size.files > 500) throw new Error(`${target.folder} exceeds the inspected extension extraction limits.`);
  console.log(`${target.folder}: ${size.bytes} expanded bytes, ${size.files} files. Runtime validation is separate from a successful build.`);
}
