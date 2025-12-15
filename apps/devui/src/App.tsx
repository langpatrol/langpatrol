import { useState, useEffect } from 'react';
import type { Report, RedactedResult } from 'langpatrol';

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
    TOKEN_OVERAGE: true,
    PII_DETECTED: true,
    SECURITY_THREAT: true
  });
  const [tokenEstimation, setTokenEstimation] = useState<'auto' | 'cheap' | 'exact' | 'off'>('auto');
  const [maxChars, setMaxChars] = useState<number>(120000);
  const [useSemanticSimilarity, setUseSemanticSimilarity] = useState<boolean>(false);
  const [useNLIEntailment, setUseNLIEntailment] = useState<boolean>(false);
  const [useNLPExtraction, setUseNLPExtraction] = useState<boolean>(false);
  const [usePatternMatching, setUsePatternMatching] = useState<boolean>(true);
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(0.6);
  const [useCombinedScoring, setUseCombinedScoring] = useState<boolean>(false);
  const [weightPattern, setWeightPattern] = useState<number>(0.4);
  const [weightSemantic, setWeightSemantic] = useState<number>(0.3);
  const [weightNLI, setWeightNLI] = useState<number>(0.3);
  const [combinedThreshold, setCombinedThreshold] = useState<number>(0.5);
  // Context-aware matching options
  const [useChunkedMatching, setUseChunkedMatching] = useState<boolean>(false);
  const [chunkSize, setChunkSize] = useState<number>(500);
  const [chunkOverlap, setChunkOverlap] = useState<number>(100);
  const [useSentenceLevel, setUseSentenceLevel] = useState<boolean>(false);
  const [usePhraseLevel, setUsePhraseLevel] = useState<boolean>(false);
  const [useMultiHypothesis, setUseMultiHypothesis] = useState<boolean>(true);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  // Cloud mode settings
  const [useCloudMode, setUseCloudMode] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('http://localhost:3000');
  const [testResults, setTestResults] = useState<{
    filename: string;
    fileSize: number;
    results: Array<{
      test: string;
      time: number;
      issues: number;
      missingRef: number;
      methods: string[];
      semanticMatches: Array<{ text: string; method: string; confidence: number }>;
    }>;
    summary: {
      baseline: { issues: number; missingRef: number; time: number };
      semantic: { issues: number; missingRef: number; time: number; matches: number };
      nli: { issues: number; missingRef: number; time: number; matches: number };
      both: { issues: number; missingRef: number; time: number; matches: number };
    };
  } | null>(null);
  const [testing, setTesting] = useState(false);
  // PII Redaction state
  const [redactionResult, setRedactionResult] = useState<RedactedResult | null>(null);
  const [redacting, setRedacting] = useState(false);

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

  const runSemanticTest = async () => {
    setTesting(true);
    setTestResults(null);
    try {
      const r = await fetch('http://localhost:5174/test-semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: '20k_tokens_prompt.txt' })
      });

      if (!r.ok) {
        const error = await r.json();
        throw new Error(error.error || 'Test failed');
      }

      const result = await r.json();
      setTestResults(result);
    } catch (error) {
      console.error(error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTesting(false);
    }
  };

  const runRedactPII = async () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt to redact');
      return;
    }
    setRedacting(true);
    setRedactionResult(null);
    try {
      const body = {
        prompt,
        options: useCloudMode && apiKey ? {
          apiKey,
          apiBaseUrl: apiBaseUrl || 'http://localhost:3000'
        } : undefined
      };

      const r = await fetch('http://localhost:5174/redact-pii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!r.ok) {
        const error = await r.json();
        throw new Error(error.error || 'PII redaction failed');
      }

      const result = await r.json();
      setRedactionResult(result);
    } catch (error) {
      console.error(error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRedacting(false);
    }
  };

  const run = async () => {
    setLoading(true);
    try {
      let messagesParsed: Array<{ role: string; content: string }> | undefined;
      try {
        messagesParsed = messages ? JSON.parse(messages) : undefined;
      } catch {
        messagesParsed = undefined;
      }

      let schemaParsed: Record<string, unknown> | undefined;
      try {
        schemaParsed = schema ? JSON.parse(schema) : undefined;
      } catch {
        schemaParsed = undefined;
      }

      // Build disabled rules list from enabled rules
      const disabledRules = Object.entries(enabledRules)
        .filter(([, enabled]) => !enabled)
        .map(([rule]) => rule);

      const body = {
        prompt,
        messages: messagesParsed,
        schema: schemaParsed,
        model,
        options: {
          disabledRules: disabledRules.length > 0 ? disabledRules : undefined,
          tokenEstimation,
          maxChars: maxChars > 0 ? maxChars : undefined,
          useSemanticSimilarity: useSemanticSimilarity || undefined,
          useNLIEntailment: useNLIEntailment || undefined,
          useNLPExtraction: useNLPExtraction || undefined,
          usePatternMatching: usePatternMatching || undefined,
          similarityThreshold: (useSemanticSimilarity || useNLIEntailment) ? similarityThreshold : undefined,
          useCombinedScoring: useCombinedScoring || undefined,
          combineWeights: useCombinedScoring ? {
            pattern: weightPattern,
            semantic: weightSemantic,
            nli: weightNLI
          } : undefined,
          combinedThreshold: useCombinedScoring ? combinedThreshold : undefined,
          // Context-aware matching options
          useChunkedMatching: useChunkedMatching || undefined,
          chunkSize: useChunkedMatching ? chunkSize : undefined,
          chunkOverlap: useChunkedMatching ? chunkOverlap : undefined,
          useSentenceLevel: useSentenceLevel || undefined,
          usePhraseLevel: usePhraseLevel || undefined,
          useMultiHypothesis: useMultiHypothesis !== undefined ? useMultiHypothesis : undefined,
          // Cloud API options
          apiKey: useCloudMode && apiKey ? apiKey : undefined,
          apiBaseUrl: useCloudMode && apiBaseUrl ? apiBaseUrl : undefined
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

            <h1 style={{ marginBottom: 16, fontSize: 24, fontWeight: 'bold' }}>Settings</h1>
            
            {/* Cloud Mode Section */}
            <div style={{ marginBottom: 16, padding: 12, border: '1px solid #007bff', borderRadius: 4, backgroundColor: '#e7f3ff' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontWeight: 'bold' }}>
                <span>Cloud Mode:</span>
                <code style={{ fontFamily: 'monospace', backgroundColor: '#007bff', color: 'white', padding: '2px 6px', borderRadius: 3 }}>CLOUD API</code>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={useCloudMode}
                    onChange={(e) => setUseCloudMode(e.target.checked)}
                    style={{ marginRight: 6, cursor: 'pointer' }}
                  />
                  <span>
                    <strong>Use Cloud API</strong> - Route analysis through cloud API instead of local processing
                  </span>
                </label>
                {useCloudMode && (
                  <>
                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 'bold' }}>
                        API Key:
                      </label>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Enter your API key"
                        style={{ width: '100%', padding: 8, fontFamily: 'monospace', fontSize: 14, border: '1px solid #ddd', borderRadius: 4 }}
                      />
                      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                        Your API key will be sent to the cloud API for authentication
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 'bold' }}>
                        API Base URL:
                      </label>
                      <input
                        type="text"
                        value={apiBaseUrl}
                        onChange={(e) => setApiBaseUrl(e.target.value)}
                        placeholder="http://localhost:3000"
                        style={{ width: '100%', padding: 8, fontFamily: 'monospace', fontSize: 14, border: '1px solid #ddd', borderRadius: 4 }}
                      />
                      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                        Base URL for the cloud API (default: http://localhost:3000)
                      </div>
                    </div>
                    {useCloudMode && !apiKey && (
                      <div style={{ padding: 8, backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: 4, fontSize: 12, color: '#856404' }}>
                        ⚠️ Please enter your API key to use cloud mode
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

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
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Enabled Checks & Rules:</label>
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

            {enabledRules.MISSING_REFERENCE && (
              <div style={{ marginBottom: 16, padding: 12, border: '1px solid #ddd', borderRadius: 4, backgroundColor: '#f0f9ff' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontWeight: 'bold' }}>
                  <span>Semantic Features:</span>
                  <code style={{ fontFamily: 'monospace', backgroundColor: '#fcba03', padding: '2px 6px', borderRadius: 3 }}>MISSING_REFERENCE</code>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={usePatternMatching}
                      onChange={(e) => setUsePatternMatching(e.target.checked)}
                      style={{ marginRight: 6, cursor: 'pointer' }}
                    />
                    <span>
                      <strong>Use Pattern Matching</strong> - Fast exact/synonym matching (can be disabled to rely only on semantic/NLI)
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={useNLPExtraction}
                      onChange={(e) => setUseNLPExtraction(e.target.checked)}
                      style={{ marginRight: 6, cursor: 'pointer' }}
                    />
                    <span>
                      <strong>Use NLP Extraction</strong> - TinyBERT NER model for dynamic noun extraction (instead of taxonomy)
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={useSemanticSimilarity}
                      onChange={(e) => setUseSemanticSimilarity(e.target.checked)}
                      style={{ marginRight: 6, cursor: 'pointer' }}
                    />
                    <span>
                      <strong>Use Semantic Similarity</strong> - MiniLM-L6-v2 embeddings for paraphrase-aware checks
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={useNLIEntailment}
                      onChange={(e) => setUseNLIEntailment(e.target.checked)}
                      style={{ marginRight: 6, cursor: 'pointer' }}
                    />
                    <span>
                      <strong>Use NLI Entailment</strong> - distilbert-base-uncased-mnli for semantic validation
                    </span>
                  </label>
                  {(useSemanticSimilarity || useNLIEntailment) && (
                    <>
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 14 }}>
                          Similarity Threshold:
                          <input
                            type="number"
                            value={similarityThreshold}
                            onChange={(e) => setSimilarityThreshold(Number(e.target.value) || 0.6)}
                            min={0}
                            max={1}
                            step={0.1}
                            style={{ marginLeft: 8, padding: 4, width: 80 }}
                          />
                        </label>
                        <span style={{ fontSize: 12, color: '#666' }}>
                          (0.0 - 1.0, default: 0.6)
                        </span>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14, marginTop: 8 }}>
                        <input
                          type="checkbox"
                          checked={useCombinedScoring}
                          onChange={(e) => setUseCombinedScoring(e.target.checked)}
                          style={{ marginRight: 6, cursor: 'pointer' }}
                        />
                        <span>
                          <strong>Use Combined Scoring</strong> - Combine all three methods with weighted scores
                        </span>
                      </label>
                      {useCombinedScoring && (
                        <div style={{ marginTop: 8, padding: 8, backgroundColor: '#fff', borderRadius: 4, border: '1px solid #ddd' }}>
                          <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8 }}>Scoring Weights:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <label style={{ fontSize: 12, width: 100 }}>Pattern:</label>
                              <input
                                type="number"
                                value={weightPattern}
                                onChange={(e) => setWeightPattern(Number(e.target.value) || 0.4)}
                                min={0}
                                max={1}
                                step={0.1}
                                style={{ padding: 4, width: 80 }}
                              />
                              <span style={{ fontSize: 11, color: '#666' }}>
                                ({((weightPattern / (weightPattern + weightSemantic + weightNLI || 1)) * 100).toFixed(0)}%)
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <label style={{ fontSize: 12, width: 100 }}>Semantic:</label>
                              <input
                                type="number"
                                value={weightSemantic}
                                onChange={(e) => setWeightSemantic(Number(e.target.value) || 0.3)}
                                min={0}
                                max={1}
                                step={0.1}
                                style={{ padding: 4, width: 80 }}
                              />
                              <span style={{ fontSize: 11, color: '#666' }}>
                                ({((weightSemantic / (weightPattern + weightSemantic + weightNLI || 1)) * 100).toFixed(0)}%)
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <label style={{ fontSize: 12, width: 100 }}>NLI:</label>
                              <input
                                type="number"
                                value={weightNLI}
                                onChange={(e) => setWeightNLI(Number(e.target.value) || 0.3)}
                                min={0}
                                max={1}
                                step={0.1}
                                style={{ padding: 4, width: 80 }}
                              />
                              <span style={{ fontSize: 11, color: '#666' }}>
                                ({((weightNLI / (weightPattern + weightSemantic + weightNLI || 1)) * 100).toFixed(0)}%)
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                              <label style={{ fontSize: 12, width: 100 }}>Threshold:</label>
                              <input
                                type="number"
                                value={combinedThreshold}
                                onChange={(e) => setCombinedThreshold(Number(e.target.value) || 0.5)}
                                min={0}
                                max={1}
                                step={0.1}
                                style={{ padding: 4, width: 80 }}
                              />
                              <span style={{ fontSize: 11, color: '#666' }}>Combined score threshold</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Context-Aware Matching Options */}
                      <div style={{ marginTop: 12, padding: 8, backgroundColor: '#fff3cd', borderRadius: 4, border: '1px solid #ffc107' }}>
                        <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8 }}>Context-Aware Matching (Debug):</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={useChunkedMatching}
                              onChange={(e) => setUseChunkedMatching(e.target.checked)}
                              style={{ marginRight: 6, cursor: 'pointer' }}
                            />
                            <span>Use Chunked Matching (auto for texts &gt; 1000 chars)</span>
                          </label>
                          {useChunkedMatching && (
                            <div style={{ marginLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <label style={{ fontSize: 11, width: 80 }}>Chunk Size:</label>
                                <input
                                  type="number"
                                  value={chunkSize}
                                  onChange={(e) => setChunkSize(Number(e.target.value) || 500)}
                                  min={100}
                                  max={2000}
                                  step={100}
                                  style={{ padding: 2, width: 80, fontSize: 11 }}
                                />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <label style={{ fontSize: 11, width: 80 }}>Overlap:</label>
                                <input
                                  type="number"
                                  value={chunkOverlap}
                                  onChange={(e) => setChunkOverlap(Number(e.target.value) || 100)}
                                  min={0}
                                  max={500}
                                  step={50}
                                  style={{ padding: 2, width: 80, fontSize: 11 }}
                                />
                              </div>
                            </div>
                          )}
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={useSentenceLevel}
                              onChange={(e) => setUseSentenceLevel(e.target.checked)}
                              style={{ marginRight: 6, cursor: 'pointer' }}
                            />
                            <span>Use Sentence-Level Matching</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={usePhraseLevel}
                              onChange={(e) => setUsePhraseLevel(e.target.checked)}
                              style={{ marginRight: 6, cursor: 'pointer' }}
                            />
                            <span>Use Phrase-Level Matching (most precise)</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={useMultiHypothesis}
                              onChange={(e) => setUseMultiHypothesis(e.target.checked)}
                              style={{ marginRight: 6, cursor: 'pointer' }}
                            />
                            <span>Use Multiple NLI Hypotheses (default: enabled)</span>
                          </label>
                        </div>
                      </div>
                      
                      {/* Debug Mode Toggle */}
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14, marginTop: 12 }}>
                        <input
                          type="checkbox"
                          checked={debugMode}
                          onChange={(e) => setDebugMode(e.target.checked)}
                          style={{ marginRight: 6, cursor: 'pointer' }}
                        />
                        <span><strong>Debug Mode</strong> - Show detailed matching information</span>
                      </label>
                    </>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                  {useCombinedScoring 
                    ? 'Combined scoring: Runs all methods and combines scores with weights'
                    : 'Hierarchical checking: pattern → semantic similarity → NLI entailment'}
                </div>
              </div>
            )}

            {enabledRules.TOKEN_OVERAGE && (
              <div style={{ marginBottom: 16, padding: 12, border: '1px solid #ddd', borderRadius: 4, backgroundColor: '#f0f8ff' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontWeight: 'bold' }}>
                  <span>Token Estimation:</span>
                  <code style={{ fontFamily: 'monospace', backgroundColor: '#fcba03', padding: '2px 6px', borderRadius: 3 }}>TOKEN_OVERAGE</code>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="radio"
                      name="tokenEstimation"
                      value="auto"
                      checked={tokenEstimation === 'auto'}
                      onChange={(e) => setTokenEstimation(e.target.value as 'auto' | 'cheap' | 'exact' | 'off')}
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
                      onChange={(e) => setTokenEstimation(e.target.value as 'auto' | 'cheap' | 'exact' | 'off')}
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
                      onChange={(e) => setTokenEstimation(e.target.value as 'auto' | 'cheap' | 'exact' | 'off')}
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
                      onChange={(e) => setTokenEstimation(e.target.value as 'auto' | 'cheap' | 'exact' | 'off')}
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

            <h1 style={{ marginBottom: 16, fontSize: 24, fontWeight: 'bold', paddingTop: 16 }}>Input</h1>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              <button
                onClick={run}
                disabled={loading || (useCloudMode && !apiKey)}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  fontSize: 16,
                  fontWeight: 'bold',
                  backgroundColor: loading || (useCloudMode && !apiKey) ? '#ccc' : (useCloudMode ? '#28a745' : '#007bff'),
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: loading || (useCloudMode && !apiKey) ? 'not-allowed' : 'pointer'
                }}
              >
                {loading 
                  ? (useCloudMode ? 'Analyzing via Cloud...' : 'Analyzing...') 
                  : (useCloudMode ? 'Analyze via Cloud API' : 'Analyze')}
              </button>

              {enabledRules.MISSING_REFERENCE && (
                <button
                  onClick={runSemanticTest}
                  disabled={testing}
                  style={{
                    flex: 1,
                    padding: '12px 24px',
                    fontSize: 16,
                    fontWeight: 'bold',
                    backgroundColor: testing ? '#ccc' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: testing ? 'not-allowed' : 'pointer'
                  }}
                >
                  {testing ? 'Testing...' : 'Test Semantic Features • MISSING_REFERENCE'}
                </button>
              )}
              <button
                onClick={runRedactPII}
                disabled={redacting || (useCloudMode && !apiKey)}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  fontSize: 16,
                  fontWeight: 'bold',
                  backgroundColor: redacting || (useCloudMode && !apiKey) ? '#ccc' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: redacting || (useCloudMode && !apiKey) ? 'not-allowed' : 'pointer'
                }}
              >
                {redacting 
                  ? (useCloudMode ? 'Redacting via Cloud...' : 'Redacting PII...') 
                  : (useCloudMode ? 'Redact PII via Cloud API' : 'Redact PII')}
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Results */}
        <div style={{ flex: '0 0 50%', overflowY: 'auto', backgroundColor: '#fff' }}>
          <div style={{ padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Report</h2>
            
            {/* PII Redaction Results */}
            {redactionResult && (
              <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#fff5f5', borderRadius: 4, border: '1px solid #dc3545' }}>
                <h3 style={{ marginTop: 0, marginBottom: 12, color: '#dc3545' }}>PII Redaction Results</h3>
                
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ marginTop: 0, marginBottom: 8 }}>Original Prompt</h4>
                  <div style={{ 
                    padding: 12, 
                    backgroundColor: '#fff', 
                    borderRadius: 4, 
                    border: '1px solid #ddd',
                    fontFamily: 'monospace',
                    fontSize: 14,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {redactionResult.prompt}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ marginTop: 0, marginBottom: 8 }}>Redacted Prompt</h4>
                  <div style={{ 
                    padding: 12, 
                    backgroundColor: '#fff', 
                    borderRadius: 4, 
                    border: '1px solid #28a745',
                    fontFamily: 'monospace',
                    fontSize: 14,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: '#28a745'
                  }}>
                    {redactionResult.redacted_prompt}
                  </div>
                </div>

                {redactionResult.detection && redactionResult.detection.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ marginTop: 0, marginBottom: 8 }}>
                      Detected PII ({redactionResult.detection.length})
                    </h4>
                    <div style={{ 
                      maxHeight: '400px',
                      overflowY: 'auto',
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      backgroundColor: '#fff'
                    }}>
                      {redactionResult.detection.map((det, idx) => (
                        <div 
                          key={idx}
                          style={{
                            padding: 12,
                            borderBottom: idx < redactionResult.detection.length - 1 ? '1px solid #eee' : 'none',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', color: '#dc3545', marginBottom: 4 }}>
                              {det.placeholder} ({det.key})
                            </div>
                            <div style={{ fontSize: 12, color: '#666', fontFamily: 'monospace' }}>
                              {det.value}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: '#999', marginLeft: 12 }}>
                            Index: {det.index}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!redactionResult.detection || redactionResult.detection.length === 0) && (
                  <div style={{ padding: 12, backgroundColor: '#e8f5e9', borderRadius: 4, color: '#2e7d32' }}>
                    ✓ No PII detected in the prompt
                  </div>
                )}
              </div>
            )}
            
            {/* Semantic Test Results */}
            {testResults && (
              <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#f0f9ff', borderRadius: 4, border: '1px solid #007bff' }}>
                <h3 style={{ marginTop: 0, marginBottom: 12 }}>Semantic Features Test Results</h3>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                  File: {testResults.filename} ({testResults.fileSize.toLocaleString()} chars)
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ marginTop: 0, marginBottom: 8 }}>Summary</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                    <div>
                      <strong>Baseline:</strong> {testResults.summary.baseline.missingRef} MISSING_REF issues, {testResults.summary.baseline.time.toFixed(0)}ms
                    </div>
                    <div>
                      <strong>Semantic:</strong> {testResults.summary.semantic.missingRef} issues, {testResults.summary.semantic.matches} matches, {testResults.summary.semantic.time.toFixed(0)}ms
                    </div>
                    <div>
                      <strong>NLI:</strong> {testResults.summary.nli.missingRef} issues, {testResults.summary.nli.matches} matches, {testResults.summary.nli.time.toFixed(0)}ms
                    </div>
                    <div>
                      <strong>Both:</strong> {testResults.summary.both.missingRef} issues, {testResults.summary.both.matches} matches, {testResults.summary.both.time.toFixed(0)}ms
                    </div>
                  </div>
                </div>

                <div>
                  <h4 style={{ marginTop: 0, marginBottom: 8 }}>Detailed Results</h4>
                  {testResults.results.map((result, idx) => (
                    <div key={idx} style={{ marginBottom: 12, padding: 12, backgroundColor: '#fff', borderRadius: 4, border: '1px solid #ddd' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{result.test}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>
                        Time: {result.time.toFixed(2)}ms • Issues: {result.issues} • MISSING_REF: {result.missingRef}
                      </div>
                      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                        Methods: {result.methods.join(', ') || 'none'}
                      </div>
                      {result.semanticMatches.length > 0 && (
                        <div style={{ marginTop: 8, fontSize: 11 }}>
                          <strong>Semantic Matches ({result.semanticMatches.length}):</strong>
                          {result.semanticMatches.slice(0, 3).map((match, midx) => (
                            <div key={midx} style={{ marginLeft: 8, color: '#28a745' }}>
                              • {match.method}: "{match.text.substring(0, 50)}..." (confidence: {match.confidence.toFixed(3)})
                            </div>
                          ))}
                          {result.semanticMatches.length > 3 && (
                            <div style={{ marginLeft: 8, color: '#666' }}>
                              ... and {result.semanticMatches.length - 3} more
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
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
                                      {/* Show fulfillment methods if semantic features were used */}
                                      {evidence.occurrences.some((occ) => {
                                        if ('fulfillmentMethod' in occ && occ.fulfillmentMethod) {
                                          const method = occ.fulfillmentMethod as string;
                                          return method === 'semantic-similarity' || method === 'nli-entailment' || method === 'combined';
                                        }
                                        return false;
                                      }) && (
                                        <div style={{ marginTop: 4, fontSize: 11, color: '#4caf50' }}>
                                          <strong>Semantic methods used:</strong>{' '}
                                          {Array.from(new Set(
                                            evidence.occurrences
                                              .map((occ) => {
                                                if ('fulfillmentMethod' in occ && occ.fulfillmentMethod) {
                                                  const method = occ.fulfillmentMethod as string;
                                                  if (method === 'semantic-similarity' || method === 'nli-entailment' || method === 'combined') {
                                                    return method;
                                                  }
                                                }
                                                return null;
                                              })
                                              .filter((m) => m !== null) as string[]
                                          )).join(', ')}
                                        </div>
                                      )}
                                      {/* Verbose scoring details */}
                                      {(debugMode || evidence.occurrences.some((occ) => 'fulfillmentDetails' in occ && occ.fulfillmentDetails)) && (
                                        <details style={{ marginTop: 8 }} open={debugMode}>
                                          <summary style={{ cursor: 'pointer', fontSize: 11, color: '#666', fontWeight: 'bold' }}>
                                            {debugMode ? '🔍 Debug Mode: ' : '📊 '}Verbose Scoring Details
                                            {debugMode && <span style={{ marginLeft: 8, fontSize: 10, color: '#ff9800' }}>(Expanded)</span>}
                                          </summary>
                                          <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'monospace', backgroundColor: '#f9f9f9', padding: 8, borderRadius: 4 }}>
                                            {evidence.occurrences
                                              .filter((occ) => debugMode || ('fulfillmentDetails' in occ && occ.fulfillmentDetails))
                                              .map((occ, occIdx) => {
                                                const details = ('fulfillmentDetails' in occ && occ.fulfillmentDetails) ? occ.fulfillmentDetails : {};
                                                const status = ('fulfillmentStatus' in occ && occ.fulfillmentStatus) ? occ.fulfillmentStatus : 'unknown';
                                                const method = ('fulfillmentMethod' in occ && occ.fulfillmentMethod) ? occ.fulfillmentMethod : 'none';
                                                const confidence = ('fulfillmentConfidence' in occ && occ.fulfillmentConfidence !== undefined) ? occ.fulfillmentConfidence : 0;
                                                
                                                // Status color coding
                                                const statusColor = status === 'fulfilled' ? '#4caf50' : status === 'unfulfilled' ? '#f44336' : '#ff9800';
                                                
                                                return (
                                                  <div key={occIdx} style={{ marginBottom: 12, padding: 8, backgroundColor: '#fff', borderRadius: 4, border: '1px solid #ddd' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                      <div style={{ fontWeight: 'bold', color: '#333', fontSize: 11 }}>
                                                        "{occ.text.substring(0, 50)}{occ.text.length > 50 ? '...' : ''}"
                                                      </div>
                                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, backgroundColor: statusColor, color: '#fff', fontWeight: 'bold' }}>
                                                          {status.toUpperCase()}
                                                        </span>
                                                        <span style={{ fontSize: 10, color: '#666' }}>
                                                          {confidence.toFixed(3)}
                                                        </span>
                                                      </div>
                                                    </div>
                                                    
                                                    <div style={{ marginBottom: 6 }}>
                                                      <span style={{ fontSize: 10, color: '#666' }}>Method: </span>
                                                      <span style={{ fontSize: 10, color: '#333', fontWeight: 'bold' }}>{method}</span>
                                                    </div>
                                                    
                                                    {/* Score bars for visual debugging */}
                                                    {debugMode && (
                                                      <div style={{ marginBottom: 8 }}>
                                                        <div style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>Scores:</div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                          {details.patternScore !== undefined && (
                                                            <div>
                                                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
                                                                <span style={{ color: '#666' }}>Pattern</span>
                                                                <span style={{ color: '#333' }}>{details.patternScore.toFixed(3)}</span>
                                                              </div>
                                                              <div style={{ width: '100%', height: 6, backgroundColor: '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
                                                                <div style={{ width: `${details.patternScore * 100}%`, height: '100%', backgroundColor: '#2196f3' }} />
                                                              </div>
                                                            </div>
                                                          )}
                                                          {details.similarityScore !== undefined && (
                                                            <div>
                                                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
                                                                <span style={{ color: '#666' }}>Semantic Similarity</span>
                                                                <span style={{ color: '#333' }}>{details.similarityScore.toFixed(3)}</span>
                                                              </div>
                                                              <div style={{ width: '100%', height: 6, backgroundColor: '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
                                                                <div style={{ width: `${details.similarityScore * 100}%`, height: '100%', backgroundColor: '#4caf50' }} />
                                                              </div>
                                                            </div>
                                                          )}
                                                          {details.entailmentScore !== undefined && (
                                                            <div>
                                                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
                                                                <span style={{ color: '#666' }}>NLI Entailment</span>
                                                                <span style={{ color: '#333' }}>{details.entailmentScore.toFixed(3)}</span>
                                                              </div>
                                                              <div style={{ width: '100%', height: 6, backgroundColor: '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
                                                                <div style={{ width: `${details.entailmentScore * 100}%`, height: '100%', backgroundColor: '#9c27b0' }} />
                                                              </div>
                                                            </div>
                                                          )}
                                                          {details.combinedScore !== undefined && (
                                                            <div>
                                                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
                                                                <span style={{ color: '#666', fontWeight: 'bold' }}>Combined Score</span>
                                                                <span style={{ color: '#333', fontWeight: 'bold' }}>{details.combinedScore.toFixed(3)}</span>
                                                              </div>
                                                              <div style={{ width: '100%', height: 8, backgroundColor: '#e0e0e0', borderRadius: 3, overflow: 'hidden', border: '2px solid #333' }}>
                                                                <div style={{ width: `${details.combinedScore * 100}%`, height: '100%', backgroundColor: '#ff9800' }} />
                                                              </div>
                                                            </div>
                                                          )}
                                                        </div>
                                                      </div>
                                                    )}
                                                    
                                                    {/* Detailed scores table */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 10 }}>
                                                      {details.patternScore !== undefined && (
                                                        <>
                                                          <span style={{ color: '#666' }}>Pattern Score:</span>
                                                          <span style={{ color: '#333' }}>{details.patternScore.toFixed(3)}</span>
                                                        </>
                                                      )}
                                                      {details.similarityScore !== undefined && (
                                                        <>
                                                          <span style={{ color: '#666' }}>Semantic Score:</span>
                                                          <span style={{ color: '#333' }}>{details.similarityScore.toFixed(3)}</span>
                                                        </>
                                                      )}
                                                      {details.entailmentScore !== undefined && (
                                                        <>
                                                          <span style={{ color: '#666' }}>NLI Score:</span>
                                                          <span style={{ color: '#333' }}>{details.entailmentScore.toFixed(3)}</span>
                                                        </>
                                                      )}
                                                      {details.combinedScore !== undefined && (
                                                        <>
                                                          <span style={{ color: '#666', fontWeight: 'bold' }}>Combined Score:</span>
                                                          <span style={{ color: '#333', fontWeight: 'bold' }}>{details.combinedScore.toFixed(3)}</span>
                                                        </>
                                                      )}
                                                      {details.matchedText && (
                                                        <>
                                                          <span style={{ color: '#666' }}>Matched Text:</span>
                                                          <span style={{ color: '#333' }}>"{details.matchedText}"</span>
                                                        </>
                                                      )}
                                                      {occ.term && (
                                                        <>
                                                          <span style={{ color: '#666' }}>Term:</span>
                                                          <span style={{ color: '#333' }}>{occ.term}</span>
                                                        </>
                                                      )}
                                                      {occ.turn !== undefined && (
                                                        <>
                                                          <span style={{ color: '#666' }}>Turn:</span>
                                                          <span style={{ color: '#333' }}>{occ.turn}</span>
                                                        </>
                                                      )}
                                                    </div>
                                                    
                                                    {debugMode && (
                                                      <div style={{ marginTop: 6, padding: 4, backgroundColor: '#e3f2fd', borderRadius: 3, fontSize: 9, color: '#1976d2' }}>
                                                        💡 Check browser console for detailed logs: [FulfillmentChecker], [SemanticSimilarity], [NLI]
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                          </div>
                                        </details>
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

                {/* Debug: Show fulfillment methods used */}
                {report.issues.some(issue => {
                  if (issue.code === 'MISSING_REFERENCE' && issue.evidence && !Array.isArray(issue.evidence) && issue.evidence.occurrences) {
                    return issue.evidence.occurrences.some((occ) => {
                      if ('fulfillmentMethod' in occ && occ.fulfillmentMethod) {
                        const method = occ.fulfillmentMethod as string;
                        return method === 'semantic-similarity' || method === 'nli-entailment' || method === 'combined';
                      }
                      return false;
                    });
                  }
                  return false;
                }) && (
                  <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#e8f5e9', borderRadius: 4, border: '1px solid #4caf50' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#2e7d32' }}>
                      ✓ Semantic Features Active
                    </div>
                    <div style={{ fontSize: 12, color: '#666' }}>
                      Semantic similarity or NLI entailment was used to check references.
                      Check the browser console for detailed logs.
                    </div>
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

