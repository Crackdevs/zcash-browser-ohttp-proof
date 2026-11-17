import init, { open_stream, unary } from './trailer_harness.js';

const ready = init();
const held = new Map();
const url = name => `${location.origin}/fixture/${name}`;

function failure(error) {
  return { code: error?.code ?? null, error: error?.message ?? String(error), metadata: error?.metadata };
}

async function outcome(call) {
  try {
    const value = await call();
    return { value: value === null ? null : [...value] };
  } catch (error) {
    return failure(error);
  }
}

globalThis.probe = {
  ready,
  async unary(name) {
    await ready;
    return outcome(() => unary(url(name), 5000));
  },
  async stream(name) {
    await ready;
    const messages = [];
    let stream;
    try {
      stream = await open_stream(url(name), 5000);
      for (let index = 0; index < 8; index++) {
        const next = await outcome(() => stream.next());
        if (!next.value) return { messages, terminal: next };
        messages.push(next.value);
      }
      throw Error('Too many messages from the controlled fixture');
    } catch (error) {
      return { messages, terminal: failure(error) };
    } finally {
      stream?.free();
    }
  },
  async begin(name, useUnary, timeout) {
    await ready;
    const entry = { terminal: null };
    held.set(name, entry);
    if (useUnary) {
      entry.completion = outcome(() => unary(url(name), timeout));
    } else {
      entry.stream = await open_stream(url(name), timeout);
      entry.first = await outcome(() => entry.stream.next());
      entry.completion = outcome(() => entry.stream.next());
    }
    entry.completion.then(result => { entry.terminal = result; });
    return entry.first ?? null;
  },
  async observePending(name) {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return held.get(name).terminal;
  },
  async finish(name) {
    const entry = held.get(name);
    try {
      return await entry.completion;
    } finally {
      entry.stream?.free();
      held.delete(name);
    }
  },
};
