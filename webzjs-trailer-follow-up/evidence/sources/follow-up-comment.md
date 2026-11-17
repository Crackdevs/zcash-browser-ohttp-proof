
Thanks for adding the licence.

The co-author line is on PR #28 now: https://github.com/red-dev-inc/WebZjs/pull/28/commits/a189141. When the PR is squash-merged, GitHub's default message keeps it in the final commit.

The transport hook is yours. Tag us on the issue or PR when you have something, and we will test it against how we would use it.

On the trailer checks: we compared your patch with #28 and ran our 15 tests against your version. It passes all of them, including two real responses we captured. Both patches forward the trailer once, handle it split across chunks, and fail if the stream ends inside it. Yours goes further in three ways:

1. It requires the stream to end right after the trailer, and rejects anything after it.
2. It requires exactly one valid `grpc-status` (0 to 16) in the trailer. If it is missing, #28 lets tonic treat the call as OK, the same as when there are no trailers at all.
3. It keeps repeated trailer keys (`append`), where #28 keeps only the last one (upstream https://github.com/devashishdxt/tonic-web-wasm-client/issues/103; https://github.com/devashishdxt/tonic-web-wasm-client/pull/117 is open for the same thing).

Our suggestion is to keep #28 as the minimal fix and send 1 and 2 as a separate follow-up PR. Two details there: a code above 16 is better mapped to `Unknown` than rejected, which is what gRPC does with unknown codes, and before requiring the end of the stream we should check that the public servers close the body promptly after the trailer, on a unary and a streaming call. Since it is your code, would you like to open that follow-up? We can help with the live check. Item 3 can go in the same PR or wait for upstream #117.
