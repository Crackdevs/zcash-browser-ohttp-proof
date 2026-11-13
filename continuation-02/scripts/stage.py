import pathlib,shutil,json,subprocess,sys
cont=pathlib.Path(__file__).resolve().parents[1];short=pathlib.Path(r'C:\Users\NewOwner\Documents\Codex\work\o1');o=short/'o2';(o/'relay').mkdir(exist_ok=True)
for file in (cont/'src').iterdir():shutil.copyfile(file,o/file.name)
for name in ['core.ts','server.ts']:
 shutil.copyfile(pathlib.Path.cwd()/'work/zcash-browser-ohttp-proof/sources/ohttp-relay/src'/name,o/'relay'/name)
subprocess.run(['node','--input-type=module','-e',"import {build} from 'esbuild'; await build({entryPoints:['adapter.js'],bundle:true,format:'esm',platform:'browser',outfile:'proof-adapter.js'});"],cwd=o,check=True)
if '--wallet' in sys.argv:
 wallet=short/'s2/packages/webzjs-wallet';shutil.copyfile(o/'proof-adapter.js',wallet/'proof-adapter.js')
 workers=list(wallet.glob('snippets/wasm_thread-*/src/wasm32/js/web_worker_module.bundler.js'));assert len(workers)==1
 p=workers[0];t=p.read_text();assert 'installProofTransport();' in t
 h=o/'app';h.mkdir(exist_ok=True)
 for n in ['index.html','app.js','component.js']:shutil.copyfile(o/n,h/n)
 (h/'app.js').write_text((h/'app.js').read_text().replace("'./proof-adapter.js'","'@proof/adapter'"))
 (h/'component.js').write_text((h/'component.js').read_text().replace("'./proof-adapter.js'","'@proof/adapter'"))
 (h/'package.json').write_text(json.dumps({'name':'proof-ohttp-harness','private':True,'type':'module','alias':{'@proof/adapter':'../../s2/packages/webzjs-wallet/proof-adapter.js','@zcashcommunitygrants/webzjs-wallet':'../../s2/packages/webzjs-wallet/webzjs_wallet.js','@zcashcommunitygrants/webzjs-keys':'../../s2/packages/webzjs-keys/webzjs_keys.js'}},indent=2))
else:
 d=o/'component-dist';d.mkdir(exist_ok=True)
 for n in ['component.js','proof-adapter.js']:shutil.copyfile(o/n,d/n)
 (d/'index.html').write_text('<!doctype html><meta charset=utf-8><script type=module src="./component.js"></script>')
