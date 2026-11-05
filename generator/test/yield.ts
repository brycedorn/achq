import { beforeEach } from "vitest";

// Vitest runs a file's tests back to back without letting the worker handle messages in between, so a file with more
// than a minute of heavy, synchronous work (rendering and checking the big designs, slower still under coverage on CI)
// misses the main process's reply and fails with "Timeout calling onTaskUpdate". A turn of the event loop before each
// test lets those replies through.
beforeEach(() => new Promise<void>((done) => setImmediate(done)));
