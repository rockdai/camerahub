'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseCameraConfig, getConfig } = require('../index');

function withTempConfig(contents, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'camerahub-'));
  const filePath = path.join(dir, 'config.json');
  fs.writeFileSync(filePath, contents, 'utf8');
  try {
    return fn({ dir, filePath });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('config parsing', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    delete process.env.CAMERA_CONFIG;

    for (let i = 1; i <= 3; i++) {
      delete process.env[`CAMERA_ID_${i}`];
      delete process.env[`CAMERA_URL_${i}`];
    }
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('parseCameraConfig: reads CAMERA_CONFIG from config file', () => {
    withTempConfig(
      JSON.stringify({
        CAMERA_CONFIG: [
          { id: 'c1', url: 'rtsp://example/1' },
          { id: 'c2', url: 'rtsp://example/2' }
        ]
      }),
      ({ filePath }) => {
        const result = parseCameraConfig({ configFilePath: filePath });
        expect(result).toEqual([
          { id: 'c1', url: 'rtsp://example/1' },
          { id: 'c2', url: 'rtsp://example/2' }
        ]);
      }
    );
  });

  test('parseCameraConfig: falls back to env CAMERA_CONFIG JSON', () => {
    process.env.CAMERA_CONFIG = JSON.stringify([{ id: 'e1', url: 'rtsp://env/1' }]);
    const result = parseCameraConfig({ configFilePath: '/path/does/not/exist.json' });
    expect(result).toEqual([{ id: 'e1', url: 'rtsp://env/1' }]);
  });

  test('parseCameraConfig: reads CAMERA_ID_n/CAMERA_URL_n pairs', () => {
    process.env.CAMERA_ID_1 = 'p1';
    process.env.CAMERA_URL_1 = 'rtsp://pair/1';
    process.env.CAMERA_ID_2 = 'p2';
    process.env.CAMERA_URL_2 = 'rtsp://pair/2';

    const result = parseCameraConfig({ configFilePath: '/path/does/not/exist.json' });
    expect(result).toEqual([
      { id: 'p1', url: 'rtsp://pair/1' },
      { id: 'p2', url: 'rtsp://pair/2' }
    ]);
  });

  test('parseCameraConfig: throws helpful error when no config found', () => {
    expect(() => parseCameraConfig({ configFilePath: '/path/does/not/exist.json' })).toThrow(
      /未找到任何摄像头配置/
    );
  });

  test('getConfig: reads key from config file, then env, else default', () => {
    withTempConfig(JSON.stringify({ MAX_RETRIES: 9 }), ({ filePath }) => {
      expect(getConfig('MAX_RETRIES', '5', { configFilePath: filePath })).toBe(9);
      process.env.RETRY_INTERVAL = '1234';
      expect(getConfig('RETRY_INTERVAL', '5000', { configFilePath: filePath })).toBe('1234');
      expect(getConfig('DOES_NOT_EXIST', 'x', { configFilePath: filePath })).toBe('x');
    });
  });
});
