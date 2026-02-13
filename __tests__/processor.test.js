'use strict';

const { EventEmitter } = require('events');

jest.mock('child_process', () => {
  return {
    spawn: jest.fn()
  };
});

const { spawn } = require('child_process');
const { CameraProcessor } = require('../index');

function createMockProc() {
  const proc = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.kill = jest.fn();
  return proc;
}

describe('CameraProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    spawn.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('starts ffmpeg with expected args and output pattern', () => {
    const proc = createMockProc();
    spawn.mockReturnValue(proc);

    const cp = new CameraProcessor(
      { id: 'cam1', url: 'rtsp://example/stream' },
      {
        outputDir: './tmp-output',
        segmentDurationSec: 10,
        errorCheckIntervalMs: 1000,
        stallTimeoutMs: 5000
      }
    );

    cp.start();

    expect(spawn).toHaveBeenCalledTimes(1);
    const [bin, args] = spawn.mock.calls[0];
    expect(bin).toBe('ffmpeg');
    expect(args).toEqual(
      expect.arrayContaining([
        '-rtsp_transport',
        'tcp',
        '-i',
        'rtsp://example/stream',
        '-f',
        'segment',
        '-segment_time',
        10
      ])
    );
    expect(args[args.length - 1]).toMatch(/cam1_%Y-%m-%d-%H-%M\.mp4$/);
  });

  test('on non-zero exit triggers a retry with exponential backoff', () => {
    const proc1 = createMockProc();
    const proc2 = createMockProc();
    spawn
      .mockReturnValueOnce(proc1)
      .mockReturnValueOnce(proc2);

    const cp = new CameraProcessor(
      { id: 'cam1', url: 'rtsp://example/stream' },
      {
        outputDir: './tmp-output',
        maxRetries: 5,
        retryIntervalMs: 5000,
        errorCheckIntervalMs: 1000,
        stallTimeoutMs: 5000
      }
    );

    cp.start();

    // simulate crash
    proc1.emit('exit', 1, null);

    // 1st retry delay = 5000ms
    jest.advanceTimersByTime(4999);
    expect(spawn).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  test('stall detection triggers retry', () => {
    const proc1 = createMockProc();
    const proc2 = createMockProc();
    spawn
      .mockReturnValueOnce(proc1)
      .mockReturnValueOnce(proc2);

    const cp = new CameraProcessor(
      { id: 'cam1', url: 'rtsp://example/stream' },
      {
        outputDir: './tmp-output',
        retryIntervalMs: 1000,
        errorCheckIntervalMs: 100,
        stallTimeoutMs: 200
      }
    );

    cp.start();

    // no stdout/stderr data: first, advance time enough to trigger stall detection.
    jest.advanceTimersByTime(400);

    // retry is scheduled with retryIntervalMs (1s here); advance to allow restart.
    jest.advanceTimersByTime(1200);

    // should have spawned a second time due to retry
    expect(spawn).toHaveBeenCalledTimes(2);
  });
});
