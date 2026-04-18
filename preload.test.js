describe('preload', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <span id="chrome-version"></span>
        <span id="node-version"></span>
        <span id="electron-version"></span>
      </div>
    `;
    global.process.versions = { chrome: '100', node: '16', electron: '20' };
  });

  test.todo('skip - preload needs mock window for event dispatch in jsdom');
  test('handles missing element gracefully', () => {
    document.body.innerHTML = '<div></div>';
    expect(() => require('./preload')).not.toThrow();
  });
});