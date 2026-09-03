import { useCallback, useEffect, useRef, useState } from 'react';
import { AFButton, AFHint, AFPanel } from '../../components/AF';
import { idToken } from '../../data/firebase';
import {
  AudioApi,
  AudioError,
  phaseLabels,
  phaseOrder,
  type AudioLimits,
  type JobPhase,
} from './api';
import './audio.css';

/**
 * reAFresh · Audio Converter.
 *
 * The format menu is served by the API rather than written here, because which
 * codecs exist is a property of the worker's ffmpeg build — a list in the
 * client would go stale the moment that image changed.
 */
export function AudioScreen({ api }: { api?: AudioApi }) {
  const client = useRef(api ?? new AudioApi({ token: idToken }));

  const [limits, setLimits] = useState<AudioLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState('mp3');
  const [bitrate, setBitrate] = useState(192);

  const [jobId, setJobId] = useState<string | null>(null);
  const [phase, setPhase] = useState<JobPhase | null>(null);
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    client.current
      .limits()
      .then((next) => {
        setLimits(next);
        setFormat(next.defaultFormat);
        setBitrate(next.defaultBitrate);
      })
      .catch((caught: unknown) => {
        if (caught instanceof AudioError) setError(caught.message);
      });
  }, []);

  // Assume configured until told otherwise, so a slow limits call does not
  // flash "not configured" at somebody whose converter is perfectly fine.
  const configured = limits?.configured ?? true;
  const chosen = limits?.formats.find((option) => option.id === format);
  // `?.` on bitrates as well as on chosen: the API layer normalises it, but a
  // whole screen going blank is too steep a price for one missing key.
  const bitrates = chosen?.bitrates?.length ? chosen.bitrates : (limits?.bitrates ?? []);

  // Polled rather than streamed: the API has no socket, and a conversion is
  // measured in seconds, so a one-second poll is both simple and accurate
  // enough to watch.
  useEffect(() => {
    if (!jobId || phase === 'done' || phase === 'failed' || phase === 'cancelled') return;
    const timer = setInterval(() => {
      void client.current
        .status(jobId)
        .then((status) => {
          setPhase(status.phase);
          if (status.error) setError(status.error);
        })
        .catch((caught: unknown) => {
          if (caught instanceof AudioError) setError(caught.message);
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [jobId, phase]);

  const convert = useCallback(async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setSent(0);
    setPhase('queued');

    try {
      const id = await client.current.createJob({
        file,
        format,
        bitrate,
        onProgress: (loaded, total) => setSent(total ? loaded / total : 0),
      });
      setJobId(id);
    } catch (caught) {
      setError(caught instanceof AudioError ? caught.message : String(caught));
      setPhase('failed');
    } finally {
      setBusy(false);
    }
  }, [file, format, bitrate, busy]);

  const save = useCallback(async () => {
    if (!jobId || !file) return;
    try {
      const blob = await client.current.download(jobId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${file.name.replace(/\.[^.]+$/, '')}.${chosen?.extension ?? format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof AudioError ? caught.message : String(caught));
    }
  }, [jobId, file, chosen, format]);

  const tooBig = file && limits ? file.size > limits.maxUploadBytes : false;

  return (
    <div className="page aud">
      <header className="page__head">
        <span className="af-brand">Audio Converter</span>
      </header>

      {limits && !limits.configured && (
        <AFPanel label="Not configured">
          <span className="ai__warn">
            This server runs without Temporal and the object store, so nothing can be
            converted. Unset AF_CONVERTER_DISABLED on the API and restart it.
          </span>
        </AFPanel>
      )}

      {error && (
        <AFPanel label="Problem">
          <span className="ai__warn">{error}</span>
        </AFPanel>
      )}

      <AFPanel label="File" count={file ? `${(file.size / 1_048_576).toFixed(1)} MB` : 'none'}>
        <input
          type="file"
          className="aud__file"
          aria-label="Choose a file to convert"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setJobId(null);
            setPhase(null);
            setError(null);
          }}
        />
        <AFHint>
          Anything ffmpeg decodes goes in, video included — the audio track is simply
          the only stream kept.
        </AFHint>
        {tooBig && limits && (
          <AFHint>
            Too large. The limit is {(limits.maxUploadBytes / 1_048_576).toFixed(0)} MB.
          </AFHint>
        )}
      </AFPanel>

      <AFPanel label="Output">
        <div className="aud__formats">
          {(limits?.formats ?? []).map((option) => (
            <button
              key={option.id}
              type="button"
              className={`cal__view${format === option.id ? ' is-active' : ''}`}
              onClick={() => setFormat(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Hidden rather than shown doing nothing: a lossless format has no
            bitrate to choose. */}
        {chosen?.lossy && (
          <div className="aud__bitrates">
            <span className="af-panel-label">Bitrate</span>
            {bitrates.map((option) => (
              <button
                key={option}
                type="button"
                className={`cal__view${bitrate === option ? ' is-active' : ''}`}
                onClick={() => setBitrate(option)}
              >
                {option}k
              </button>
            ))}
          </div>
        )}

        {chosen?.note && <AFHint>{chosen.note}</AFHint>}
      </AFPanel>

      {phase && (
        <AFPanel label="Progress" count={phaseLabels[phase]}>
          <div className="aud__phases">
            {phaseOrder.map((step) => {
              const reached = phaseOrder.indexOf(phase) >= phaseOrder.indexOf(step);
              return <span key={step} className={`aud__phase${reached ? ' is-done' : ''}`} />;
            })}
          </div>
          {phase === 'queued' && sent > 0 && sent < 1 && (
            <AFHint>Uploading — {Math.round(sent * 100)}%</AFHint>
          )}
          {phase === 'done' && <AFButton label="Download" expand onClick={() => void save()} />}
          {(phase === 'queued' || phase === 'downloading' || phase === 'converting') && jobId && (
            <AFButton
              label="Cancel"
              variant="quiet"
              expand
              onClick={() => void client.current.cancel(jobId).catch(() => {})}
            />
          )}
        </AFPanel>
      )}

      <AFButton
        label={busy ? 'Uploading…' : 'Convert'}
        expand
        disabled={!file || busy || tooBig || !limits || !configured}
        onClick={() => void convert()}
      />
    </div>
  );
}
