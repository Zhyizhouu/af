import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
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

  const failed = phase === 'failed' || phase === 'cancelled';
  const stepIndex = phase ? phaseOrder.indexOf(phase) : -1;
  const progressPct =
    phase === 'done'
      ? 100
      : failed
        ? 40
        : stepIndex >= 0
          ? Math.round(((stepIndex + 1) / phaseOrder.length) * 100)
          : 0;

  return (
    <div className="page aud px-4! py-4! md:px-8! md:py-6! font-sans text-foreground max-w-xl">
      {limits && !limits.configured && (
        <div className="surface-3d rounded-2xl p-5">
          <span className="text-[15px] font-semibold">Not configured</span>
          <p className="mt-2 text-sm text-rose-400">
            This server runs without Temporal and the object store, so nothing can be
            converted. Unset AF_CONVERTER_DISABLED on the API and restart it.
          </p>
        </div>
      )}

      {error && (
        <div className="surface-3d rounded-2xl p-5">
          <span className="text-[15px] font-semibold">Problem</span>
          <p className="mt-2 text-sm text-rose-400">{error}</p>
        </div>
      )}

      <div className="surface-3d rounded-2xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold">File</span>
          <span className="text-xs text-muted-foreground">
            {file ? `${(file.size / 1_048_576).toFixed(1)} MB` : 'none'}
          </span>
        </div>

        <label
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.12] px-6 py-8 text-center cursor-pointer transition-colors hover:border-white/25',
          )}
        >
          <Upload size={22} className="text-subtle-foreground" aria-hidden />
          <span className="text-sm">
            {file ? file.name : 'Drop a file here, or click to choose one'}
          </span>
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
        </label>

        <p className="text-[13px] text-muted-foreground">
          Anything ffmpeg decodes goes in, video included — the audio track is simply
          the only stream kept.
        </p>
        {tooBig && limits && (
          <p className="text-[13px] text-muted-foreground">
            Too large. The limit is {(limits.maxUploadBytes / 1_048_576).toFixed(0)} MB.
          </p>
        )}
      </div>

      <div className="surface-3d rounded-2xl p-5 flex flex-col gap-3">
        <span className="text-[15px] font-semibold">Output</span>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.08em] text-subtle-foreground">
              Format
            </span>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="inset-field w-[160px]" aria-label="Output format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(limits?.formats ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {chosen?.lossy && bitrates.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-[0.08em] text-subtle-foreground">
                Bitrate
              </span>
              <Select value={String(bitrate)} onValueChange={(value) => setBitrate(Number(value))}>
                <SelectTrigger className="inset-field w-[120px]" aria-label="Bitrate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bitrates.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}k
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {chosen?.note && <p className="text-[13px] text-muted-foreground">{chosen.note}</p>}
      </div>

      {phase && (
        <div className="surface-3d rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold">Progress</span>
            <span className="text-xs text-muted-foreground">{phaseLabels[phase]}</span>
          </div>

          <div className="aud__track">
            <div
              className={cn('aud__fill', phase === 'done' ? 'is-done' : failed ? 'is-failed' : 'is-running')}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {phase === 'queued' && sent > 0 && sent < 1 && (
            <p className="text-[13px] text-muted-foreground">
              Uploading — {Math.round(sent * 100)}%
            </p>
          )}
          {phase === 'done' && (
            <Button variant="raised" className="w-full" onClick={() => void save()}>
              <Download size={16} aria-hidden />
              Download
            </Button>
          )}
          {(phase === 'queued' || phase === 'downloading' || phase === 'converting') && jobId && (
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => void client.current.cancel(jobId).catch(() => {})}
            >
              Cancel
            </Button>
          )}
        </div>
      )}

      <Button
        variant="gradient"
        className="w-full"
        disabled={!file || busy || tooBig || !limits || !configured}
        onClick={() => void convert()}
      >
        {busy ? 'Uploading…' : 'Convert'}
      </Button>
    </div>
  );
}
