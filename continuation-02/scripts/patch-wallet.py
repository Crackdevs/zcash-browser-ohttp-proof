"""Apply the narrow transport patch to the isolated pinned checkout."""
import datetime,hashlib,json,pathlib,subprocess
cont=pathlib.Path(__file__).resolve().parents[1];ev=cont/'evidence';ev.mkdir(exist_ok=True)
root=cont.parent;out=root.parent;s=pathlib.Path(r'C:\Users\NewOwner\Documents\Codex\work\o1\s2')
assert subprocess.check_output(['git','-C',str(s),'rev-parse','HEAD'],text=True).strip()=='c0457174ecb99c67a9d081fba0be54f50d0cf012'
def digest(f):
 with f.open('rb') as h:return hashlib.file_digest(h,'sha256').hexdigest()
prior={p.relative_to(out).as_posix():digest(p) for p in root.rglob('*') if p.is_file() and not p.is_relative_to(cont)}
for name in ['zcash-browser-ohttp-proof.zip','zcash-browser-ohttp-proof-continuation-01.zip']:prior[name]=digest(out/name)
(ev/'previous-hashes.json').write_text(json.dumps(prior,indent=2),encoding='utf-8')
(ev/'start.json').write_text(json.dumps({'first_retained_observation_utc':'2026-11-11T00:31:56Z','maximum_focused_hours':8,'checkout':str(s),'started_patch_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2))
v=s/'vendor/tonic-web-wasm-client/src'
f=v/'fetch.rs';t=f.read_text();old='    let js_response = JsFuture::from(js_fetch(request, init))';assert old in t
t=t.replace(old,'''    // The experiment uses an unresolvable logical origin. This mode must never
    // reach the native Fetch path, even if a worker forgot to install the hook.
    let promise = if request.url().starts_with("http://wallet-rpc.invalid/") {
        let global = js_sys::global();
        let hook = js_sys::Reflect::get(&global, &JsValue::from_str("__zcashProofOhttpFetch"))
            .map_err(Error::js_error)?;
        let hook = hook.dyn_into::<js_sys::Function>().map_err(|_| {
            Error::JsError("OHTTP transport is not installed in this realm".into())
        })?;
        hook.call2(&global, request.as_ref(), init.as_ref())
            .map_err(Error::js_error)?
            .dyn_into::<Promise>()
            .map_err(|_| Error::JsError("OHTTP transport did not return a Promise".into()))?
    } else {
        js_fetch(request, init)
    };
    let js_response = JsFuture::from(promise)''');f.write_text(t,newline='\n')
f=v/'call.rs';t=f.read_text();a=t.index('    let body_stream = response.body()');b=t.index('\n    result.body(body)',a)
t=t[:a]+'''    let trailers_only = response.headers().has("grpc-status").unwrap_or(false);
    let body = match response.body() {
        Some(body_stream) => ResponseBody::new(body_stream, &content_type, abort, trailers_only)?,
        None if trailers_only => ResponseBody::default(),
        None => return Err(Error::MissingResponseBody),
    };
'''+t[b:];f.write_text(t,newline='\n')
f=v/'response_body.rs';t=f.read_text();a=t.index('impl ReadState {');b=t.index('/// Type to handle',a);t=t[:a]+t[b:]
t=t.replace('    finished_stream: bool,','    finished_stream: bool,\n    terminal_emitted: bool,')
t=t.replace('            finished_stream: false,','            finished_stream: false,\n            terminal_emitted: false,').replace('            finished_stream: true,','            finished_stream: true,\n            terminal_emitted: true,')
a=t.index('        // Check if there\'s already some data');b=t.index('\n    }\n}',a)
t=t[:a]+'''        if self.terminal_emitted {
            return Poll::Ready(None);
        }
        loop {
            if let Err(error) = self.as_mut().step() {
                self.terminal_emitted = true;
                return Poll::Ready(Some(Err(error)));
            }
            if let Some(data) = self.data.take() {
                return Poll::Ready(Some(Ok(http_body::Frame::data(data.freeze()))));
            }
            if self.finished_stream {
                self.terminal_emitted = true;
                if self.state == ReadState::Done && self.buf.is_empty() && self.buf.raw_buf.is_empty() {
                    if let Some(trailers) = self.trailer.take() {
                        if trailers.get_all("grpc-status").iter().count() == 1
                            && trailers.get("grpc-status").and_then(|s| s.to_str().ok())
                                .and_then(|s| s.parse::<u32>().ok()).is_some_and(|s| s <= 16)
                        {
                            return Poll::Ready(Some(Ok(http_body::Frame::trailers(trailers))));
                        }
                    }
                }
                if self.trailers_only && self.state == ReadState::CompressionFlag
                    && self.buf.is_empty() && self.buf.raw_buf.is_empty() && self.incomplete_data.is_empty()
                {
                    return Poll::Ready(None);
                }
                return Poll::Ready(Some(Err(Error::MalformedResponse)));
            }
            if let Err(error) = ready!(self.as_mut().read_stream(cx)) {
                self.terminal_emitted = true;
                return Poll::Ready(Some(Err(error)));
            }
        }'''+t[b:]
t=t.replace('                            trailers.insert(header_name, header_value);','                            trailers.append(header_name, header_value);')
f.write_text(t,newline='\n')
f=s/'add-worker-module.sh';t=f.read_text();old='import init, { wasm_thread_entry_point } from "../../../../../";';assert old in t
f.write_text(t.replace(old,'import { installProofTransport } from "../../../../../proof-adapter.js";\n'+old+'\ninstallProofTransport();'),newline='\n')
patch=subprocess.check_output(['git','-C',str(s),'diff','--binary','--']);(cont/'wallet.patch').write_bytes(patch)
assert not subprocess.check_output(['git','-C',str(s),'diff','--','Cargo.lock','yarn.lock'])
print('Retained patch:',len(patch),'bytes; previous files hashed:',len(prior))
