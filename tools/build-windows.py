"""Build a pinned, checksum-verified Windows portable client using Python stdlib."""
import hashlib
import json
import shutil
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'desktop'
CONFIG = json.loads((APP / 'package.json').read_text(encoding='utf-8'))
VERSION = CONFIG['electronVersion']
CACHE = ROOT / 'work' / 'windows-build'
NAME = f"huihui-windows-x64-v{CONFIG['version']}"
OUTPUT = ROOT / 'releases' / f'{NAME}.zip'
CACHE.mkdir(parents=True, exist_ok=True)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)


def fetch(url, target):
    print(f'Downloading {url}', flush=True)
    request = urllib.request.Request(url, headers={
        'User-Agent': 'huihui-build/1.0', 'Accept': 'application/octet-stream'})
    with urllib.request.urlopen(request, timeout=120) as response, target.open('wb') as file:
        shutil.copyfileobj(response, file)


archive = f'electron-v{VERSION}-win32-x64.zip'
release_request = urllib.request.Request(
    f'https://api.github.com/repos/electron/electron/releases/tags/v{VERSION}',
    headers={'User-Agent': 'huihui-build/1.0'})
with urllib.request.urlopen(release_request, timeout=60) as response:
    assets = {asset['name']: asset['url'] for asset in json.load(response)['assets']}
checksums = CACHE / f'electron-v{VERSION}-SHASUMS256.txt'
fetch(assets['SHASUMS256.txt'], checksums)
expected = next(line.split()[0] for line in checksums.read_text().splitlines()
                if line.split()[-1].lstrip('*') == archive)
runtime_zip = CACHE / archive
if runtime_zip.exists():
    with runtime_zip.open('rb') as file:
        cached_digest = hashlib.file_digest(file, 'sha256').hexdigest()
else:
    cached_digest = None
if cached_digest != expected:
    fetch(assets[archive], runtime_zip)
with runtime_zip.open('rb') as file:
    actual = hashlib.file_digest(file, 'sha256').hexdigest()
if actual != expected:
    raise SystemExit(f'Electron SHA256 mismatch: {actual} != {expected}')
print(f'Verified Electron SHA256: {actual}', flush=True)

# Build directly from the upstream archive; no globally installed build tools or npm hooks.
with zipfile.ZipFile(runtime_zip) as runtime, zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as package:
    def add(name, data):
        entry = zipfile.ZipInfo(f'{NAME}/{name}', date_time=(2026, 1, 1, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        package.writestr(entry, data)

    for entry in sorted(runtime.infolist(), key=lambda item: item.filename):
        if entry.is_dir() or entry.filename == 'resources/default_app.asar':
            continue
        add('Huihui.exe' if entry.filename == 'electron.exe' else entry.filename, runtime.read(entry))
    for name in ['package.json', 'main.cjs', 'policy.cjs', 'offline.html']:
        add(f'resources/app/{name}', (APP / name).read_bytes())
    add('README.txt', ('辉辉客服工作台 Windows 便携版\r\n\r\n'
        '请先解压整个文件夹，再双击 Huihui.exe。不要从压缩包内部直接运行。\r\n'
        '支持 Windows 10/11 x64；需要联网。\r\n'
        '在线服务：https://www.ryh6666.xyz/huihui/\r\n'
        '网络失败时点击重新连接，或按 Ctrl+R。\r\n'
        '程序未进行代码签名；请仅从项目正式发布页面下载。\r\n'
        '客户端连接既有云端服务，消息保存在服务器。\r\n'
        f'客户端版本：{CONFIG["version"]}；Electron：{VERSION}\r\n').encode('utf-8-sig'))
    add('electron-SHASUMS256.txt', checksums.read_bytes())

with OUTPUT.open('rb') as file:
    digest = hashlib.file_digest(file, 'sha256').hexdigest()
OUTPUT.with_suffix('.zip.sha256').write_text(f'{digest}  {OUTPUT.name}\n', encoding='ascii')
print(json.dumps({'artifact': str(OUTPUT), 'bytes': OUTPUT.stat().st_size, 'sha256': digest}, indent=2))
