const status = document.getElementById('release-status');
const signing = document.getElementById('signing-status');
const links = document.querySelectorAll('a.button');
const available = enabled => links.forEach(link => { link.setAttribute('aria-disabled', String(!enabled)); if (!enabled) { link.dataset.href = link.getAttribute('href'); link.removeAttribute('href'); } else if (link.dataset.href) link.setAttribute('href', link.dataset.href); });
available(false);
fetch('../downloads/mcp-release.json?v=1.1.19', { cache: 'no-store' }).then(async response => {
  if (!response.ok) throw new Error('unavailable');
  const release = await response.json();
  if (release.product !== 'AssetMaster MCP' || release.version !== '1.1.19' || !Array.isArray(release.downloads) || release.downloads.length !== 2) throw new Error('invalid');
  status.textContent = `AssetMaster companion ${release.version} downloads are available. Editor connection is checked after installation and pairing.`;
  signing.textContent = release.scriptsSigned ? 'Installer scripts have verified Authenticode signatures. The bundled Node.js runtime was verified against its official SHA-256 checksum.' : 'This preview companion package is unsigned. The bundled Node.js runtime was verified against its official SHA-256 checksum.';
  available(true);
}).catch(() => { status.textContent = 'Companion downloads are currently unavailable. Please check again later.'; signing.textContent = 'Release signing status could not be verified.'; });
