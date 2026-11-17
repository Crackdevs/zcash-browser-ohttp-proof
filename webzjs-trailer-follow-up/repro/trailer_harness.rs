use std::time::Duration;

use bytes::{Buf, BufMut, Bytes};
use http::uri::PathAndQuery;
use js_sys::{Object, Uint8Array};
use tonic::{
    client::Grpc,
    codec::{Codec, DecodeBuf, Decoder, EncodeBuf, Encoder, Streaming},
    Request, Status,
};
use tonic_web_wasm_client::{options::FetchOptions, Client};
use wasm_bindgen::prelude::*;

struct ProbeCodec;

impl Codec for ProbeCodec {
    type Encode = Bytes;
    type Decode = Bytes;
    type Encoder = Self;
    type Decoder = Self;

    fn encoder(&mut self) -> Self::Encoder {
        Self
    }

    fn decoder(&mut self) -> Self::Decoder {
        Self
    }
}

impl Encoder for ProbeCodec {
    type Item = Bytes;
    type Error = Status;

    fn encode(&mut self, item: Bytes, dst: &mut EncodeBuf<'_>) -> Result<(), Status> {
        dst.put(item);
        Ok(())
    }
}

impl Decoder for ProbeCodec {
    type Item = Bytes;
    type Error = Status;

    fn decode(&mut self, src: &mut DecodeBuf<'_>) -> Result<Option<Bytes>, Status> {
        Ok(Some(src.copy_to_bytes(src.remaining())))
    }
}

fn client(base_url: String, timeout_ms: u32) -> Grpc<Client> {
    let options = FetchOptions::new().timeout(Duration::from_millis(timeout_ms.into()));
    Grpc::new(Client::new_with_options(base_url, options))
}

fn status_object(status: Status) -> JsValue {
    let out = Object::new();
    js_sys::Reflect::set(&out, &"code".into(), &(status.code() as i32).into()).unwrap();
    js_sys::Reflect::set(&out, &"message".into(), &status.message().into()).unwrap();
    if let Some(value) = status
        .metadata()
        .get("x-proof")
        .and_then(|v| v.to_str().ok())
    {
        js_sys::Reflect::set(&out, &"metadata".into(), &value.into()).unwrap();
    }
    out.into()
}

#[wasm_bindgen]
pub async fn unary(base_url: String, timeout_ms: u32) -> Result<Vec<u8>, JsValue> {
    client(base_url, timeout_ms)
        .unary(
            Request::new(Bytes::new()),
            PathAndQuery::from_static("/followup.Probe/Unary"),
            ProbeCodec,
        )
        .await
        .map(|response| response.into_inner().to_vec())
        .map_err(status_object)
}

#[wasm_bindgen]
pub struct ReadStream(Streaming<Bytes>);

#[wasm_bindgen]
impl ReadStream {
    pub async fn next(&mut self) -> Result<JsValue, JsValue> {
        match self.0.message().await.map_err(status_object)? {
            Some(bytes) => Ok(Uint8Array::from(bytes.as_ref()).into()),
            None => Ok(JsValue::NULL),
        }
    }
}

#[wasm_bindgen]
pub async fn open_stream(base_url: String, timeout_ms: u32) -> Result<ReadStream, JsValue> {
    client(base_url, timeout_ms)
        .server_streaming(
            Request::new(Bytes::new()),
            PathAndQuery::from_static("/followup.Probe/Stream"),
            ProbeCodec,
        )
        .await
        .map(|response| ReadStream(response.into_inner()))
        .map_err(status_object)
}
