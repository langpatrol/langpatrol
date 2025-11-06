import { useState, useEffect } from 'react';
import type { Report } from 'langpatrol';

export default function App() {
  const [prompt, setPrompt] = useState('Summarize the report.');
  const [messages, setMessages] = useState('[]');
  const [schema, setSchema] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [testFiles, setTestFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [enabledRules, setEnabledRules] = useState<Record<string, boolean>>({
    MISSING_PLACEHOLDER: true,
    MISSING_REFERENCE: true,
    CONFLICTING_INSTRUCTION: true,
    SCHEMA_RISK: true,
    TOKEN_OVERAGE: true
  });
  const [tokenEstimation, setTokenEstimation] = useState<'auto' | 'cheap' | 'exact' | 'off'>('auto');
  const [maxChars, setMaxChars] = useState<number>(120000);

  // Load test files on mount
  useEffect(() => {
    fetch('http://localhost:5174/files')
      .then((r) => {
        if (!r.ok) {
          console.warn('Failed to load test files:', r.status, r.statusText);
          return r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        }
        return r.json();
      })
      .then((data) => {
        if (data.error) {
          console.error('Server error loading files:', data);
          alert(`Error loading test files: ${data.error}\nPath: ${data.path || 'unknown'}`);
          setTestFiles([]);
          return;
        }
        const files = data.files || [];
        setTestFiles(files);
        console.log('Loaded test files:', files);
        if (files.length === 0) {
          console.warn('No test files found. Check server logs for path.');
        }
      })
      .catch((err) => {
        console.error('Error loading test files:', err);
        alert(`Error: ${err.message}\n\nMake sure devserver is running on port 5174`);
        setTestFiles([]);
      });
  }, []);

  // Load selected test file
  const loadTestFile = async (filename: string) => {
    if (!filename) return;
    setLoadingFile(true);
    try {
      const r = await fetch(`http://localhost:5174/files/${filename}`);
      if (!r.ok) throw new Error('Failed to load file');
      const data = await r.json();
      setPrompt(data.content);
      setSelectedFile(filename);
    } catch (error) {
      alert(`Error loading file: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingFile(false);
    }
  };

  const run = async () => {
    setLoading(true);
    try {
      let messagesParsed: any;
      try {
        messagesParsed = messages ? JSON.parse(messages) : undefined;
      } catch {
        messagesParsed = undefined;
      }

      let schemaParsed: any;
      try {
        schemaParsed = schema ? JSON.parse(schema) : undefined;
      } catch {
        schemaParsed = undefined;
      }

      // Build disabled rules list from enabled rules
      const disabledRules = Object.entries(enabledRules)
        .filter(([_, enabled]) => !enabled)
        .map(([rule]) => rule);

      const body = {
        prompt,
        messages: messagesParsed,
        schema: schemaParsed,
        model,
        options: {
          disabledRules: disabledRules.length > 0 ? disabledRules : undefined,
          tokenEstimation,
          maxChars: maxChars > 0 ? maxChars : undefined
        }
      };

      const r = await fetch('http://localhost:5174/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!r.ok) {
        const error = await r.json();
        throw new Error(error.error || 'Analysis failed');
      }

      const result = await r.json();
      setReport(result);
    } catch (error) {
      console.error(error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #ddd', backgroundColor: '#fff', flexShrink: 0 }}>
        <h1 style={{ margin: 0 }}>LangPatrol Dev UI</h1>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left Panel - Controls */}
        <div style={{ flex: '0 0 50%', borderRight: '1px solid #ddd', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Model:</label>
              <select value={model} onChange={(e) => setModel(e.target.value)} style={{ padding: 8, width: '100%', maxWidth: 300 }}>
                <option value="gpt-4o">gpt-4o</option>
                <option value="gpt-4o-mini">gpt-4o-mini</option>
                <option value="gpt-4-turbo">gpt-4-turbo</option>
                <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
              </select>
            </div>

            <div style={{ marginBottom: 16, padding: 12, border: '1px solid #ddd', borderRadius: 4, backgroundColor: '#f9f9f9' }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Enabled Rules:</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {Object.entries(enabledRules).map(([rule, enabled]) => (
                  <label key={rule} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabledRules({ ...enabledRules, [rule]: e.target.checked })}
                      style={{ marginRight: 6, cursor: 'pointer' }}
                    />
                    <span>{rule.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                Uncheck rules to disable them and speed up analysis
              </div>
            </div>

            {enabledRules.TOKEN_OVERAGE && (
              <div style={{ marginBottom: 16, padding: 12, border: '1px solid #ddd', borderRadius: 4, backgroundColor: '#f0f8ff' }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Token Estimation:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="radio"
                      name="tokenEstimation"
                      value="auto"
                      checked={tokenEstimation === 'auto'}
                      onChange={(e) => setTokenEstimation(e.target.value as any)}
                      style={{ marginRight: 6 }}
                    />
                    <span>
                      <strong>auto</strong> - cheap for small, exact near limit
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="radio"
                      name="tokenEstimation"
                      value="cheap"
                      checked={tokenEstimation === 'cheap'}
                      onChange={(e) => setTokenEstimation(e.target.value as any)}
                      style={{ marginRight: 6 }}
                    />
                    <span>
                      <strong>cheap</strong> - fast approximation (~0.1ms)
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="radio"
                      name="tokenEstimation"
                      value="exact"
                      checked={tokenEstimation === 'exact'}
                      onChange={(e) => setTokenEstimation(e.target.value as any)}
                      style={{ marginRight: 6 }}
                    />
                    <span>
                      <strong>exact</strong> - BPE tokenization (slow)
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="radio"
                      name="tokenEstimation"
                      value="off"
                      checked={tokenEstimation === 'off'}
                      onChange={(e) => setTokenEstimation(e.target.value as any)}
                      style={{ marginRight: 6 }}
                    />
                    <span>
                      <strong>off</strong> - skip token checks
                    </span>
                  </label>
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 14 }}>
                    Max chars (early bail):
                    <input
                      type="number"
                      value={maxChars}
                      onChange={(e) => setMaxChars(Number(e.target.value) || 0)}
                      min={0}
                      style={{ marginLeft: 8, padding: 4, width: 120 }}
                    />
                  </label>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    Skip exact tokenization if input exceeds this
                  </span>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                Prompt:
                <span style={{ marginLeft: 12, fontSize: 14, fontWeight: 'normal' }}>
                  <select
                    value={selectedFile}
                    onChange={(e) => {
                      setSelectedFile(e.target.value);
                      if (e.target.value) loadTestFile(e.target.value);
                    }}
                    disabled={loadingFile || testFiles.length === 0}
                    style={{ padding: 4, marginLeft: 8, minWidth: 200 }}
                  >
                    <option value="">
                      {testFiles.length === 0 ? '-- No test files --' : '-- Load test file --'}
                    </option>
                    {testFiles.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  {!loadingFile && <span style={{ marginLeft: 8,fontSize: 12, color: '#666' }}>Load .txt/.csv files from directory /datasets/synthetic/</span>}
                  {loadingFile && <span style={{ marginLeft: 8 }}>Loading...</span>}
                </span>
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                style={{ width: '100%', padding: 8, fontFamily: 'monospace', fontSize: 14 }}
              />
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                {prompt.length.toLocaleString()} characters
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Messages (JSON):</label>
              <textarea
                value={messages}
                onChange={(e) => setMessages(e.target.value)}
                rows={5}
                style={{ width: '100%', padding: 8, fontFamily: 'monospace', fontSize: 14 }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Schema (JSON):</label>
              <textarea
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                rows={5}
                style={{ width: '100%', padding: 8, fontFamily: 'monospace', fontSize: 14 }}
              />
            </div>

          </div>
          {/* Fixed button at bottom */}
          <div style={{ padding: 16, borderTop: '1px solid #ddd', backgroundColor: '#fff', flexShrink: 0 }}>
            <button
              onClick={run}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 24px',
                fontSize: 16,
                fontWeight: 'bold',
                backgroundColor: loading ? '#ccc' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
        </div>

        {/* Right Panel - Results */}
        <div style={{ flex: '0 0 50%', overflowY: 'auto', backgroundColor: '#fff' }}>
          <div style={{ padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Report</h2>
            {report ? (
              <div>
                {/* Summary */}
                {report.summary && (
                  <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Summary</div>
                    <div style={{ fontSize: 14 }}>
                      {Object.entries(report.summary.issueCounts || {}).map(([code, count]) => (
                        <span key={code} style={{ marginRight: 12 }}>
                          <strong>{code}:</strong> {count}
                        </span>
                      ))}
                    </div>
                    {report.summary.confidence && (
                      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                        Confidence: {report.summary.confidence}
                      </div>
                    )}
                  </div>
                )}

                {/* Issues */}
                {report.issues.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ marginTop: 0, marginBottom: 12 }}>Issues ({report.issues.length})</h3>
                    {report.issues.map((issue, idx) => (
                      <div
                        key={issue.id || idx}
                        style={{
                          marginBottom: 12,
                          padding: 12,
                          border: '1px solid #ddd',
                          borderRadius: 4,
                          backgroundColor: issue.severity === 'high' ? '#fff5f5' : issue.severity === 'medium' ? '#fffbf0' : '#f5f5f5'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                          <div>
                            <strong style={{ color: issue.severity === 'high' ? '#c00' : issue.severity === 'medium' ? '#f80' : '#666' }}>
                              {issue.code}
                            </strong>
                            {issue.scope && (
                              <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>
                                ({issue.scope.type}
                                {issue.scope.messageIndex != null ? `, msg ${issue.scope.messageIndex}` : ''})
                              </span>
                            )}
                          </div>
                          {issue.confidence && (
                            <span style={{ fontSize: 12, color: '#666' }}>{issue.confidence}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 14, marginBottom: 8 }}>{issue.detail}</div>
                        {issue.evidence && (() => {
                          const evidence = issue.evidence;
                          return (
                            <div style={{ fontSize: 12, color: '#666' }}>
                              {Array.isArray(evidence) ? (
                                <div>
                                  <strong>Evidence:</strong> {evidence.slice(0, 5).join(', ')}
                                  {evidence.length > 5 && ` (+${evidence.length - 5} more)`}
                                </div>
                              ) : (
                                <div>
                                  {evidence.summary && evidence.summary.length > 0 && (
                                    <div style={{ marginBottom: 4 }}>
                                      <strong>Summary:</strong>{' '}
                                      {evidence.summary.map((s, i) => (
                                        <span key={i}>
                                          "{s.text}" ×{s.count}
                                          {i < evidence.summary!.length - 1 ? ', ' : ''}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {evidence.occurrences && evidence.occurrences.length > 0 && (
                                    <div>
                                      <strong>Occurrences:</strong> {evidence.occurrences.length} found
                                      {evidence.firstSeenAt && (
                                        <span>
                                          {' '}
                                          (first at char {evidence.firstSeenAt.char}
                                          {evidence.firstSeenAt.messageIndex != null
                                            ? `, msg ${evidence.firstSeenAt.messageIndex}`
                                            : ''}
                                          )
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}

                {/* Suggestions */}
                {report.suggestions && report.suggestions.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ marginTop: 0, marginBottom: 12 }}>Suggestions ({report.suggestions.length})</h3>
                    {report.suggestions.map((suggestion, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginBottom: 8,
                          padding: 8,
                          backgroundColor: '#f0f8ff',
                          borderRadius: 4,
                          fontSize: 14
                        }}
                      >
                        <strong>{suggestion.type}:</strong> {suggestion.text}
                        {suggestion.for && (
                          <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>(for {suggestion.for})</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Cost & Meta */}
                {(report.cost || report.meta) && (
                  <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Metadata</div>
                    {report.cost && (
                      <div style={{ fontSize: 14, marginBottom: 4 }}>
                        <strong>Cost:</strong> {report.cost.estInputTokens.toLocaleString()} tokens
                        {report.cost.estUSD && ` ($${report.cost.estUSD.toFixed(4)})`}
                        {report.cost.charCount && ` • ${report.cost.charCount.toLocaleString()} chars`}
                        {report.cost.method && ` • method: ${report.cost.method}`}
                      </div>
                    )}
                    {report.meta && (
                      <div style={{ fontSize: 14 }}>
                        <strong>Performance:</strong> {report.meta.latencyMs.toFixed(2)}ms
                        {report.meta.contextWindow && ` • window: ${report.meta.contextWindow.toLocaleString()}`}
                        {report.meta.traceId && (
                          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                            Trace ID: {report.meta.traceId}
                          </div>
                        )}
                        {report.meta.ruleTimings && (
                          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                            Rule timings:{' '}
                            {Object.entries(report.meta.ruleTimings)
                              .map(([rule, ms]) => `${rule}: ${ms.toFixed(2)}ms`)
                              .join(', ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Raw JSON (collapsible) */}
                <details style={{ marginTop: 16 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: 8 }}>Raw JSON</summary>
                  <div style={{ background: '#111', color: '#0f0', padding: 16, borderRadius: 4, overflowX: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(report, null, 2)}</pre>
                  </div>
                </details>
              </div>
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: 14 }}>
                No report yet. Run analysis to see results.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

