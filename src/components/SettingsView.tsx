import { FormEvent, useEffect, useState } from 'react';
import { Check, Info, RotateCcw, Server } from 'lucide-react';
import { AspectRatio, CaptionTemplateId, UserSettings } from '../types/clipforge';
import { ASPECT_RATIOS, CAPTION_TEMPLATES } from '../data/templates';
import { detectBrowserMediaCapabilities } from '../utils/videoEngine';

interface SettingsViewProps {
  settings: UserSettings;
  onSaveSettings: (next: UserSettings) => void;
  onResetWorkspaceData: () => void;
}

interface HealthResponse {
  ok: boolean;
  geminiConfigured?: boolean;
}

export function SettingsView({
  settings,
  onSaveSettings,
  onResetWorkspaceData,
}: SettingsViewProps) {
  const [form, setForm] = useState<UserSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [apiHealth, setApiHealth] = useState<'checking' | 'ready' | 'unconfigured' | 'offline'>(
    'checking'
  );

  const capabilities = detectBrowserMediaCapabilities();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Health check failed'))))
      .then((data: HealthResponse) => {
        if (cancelled) return;
        setApiHealth(data.geminiConfigured ? 'ready' : 'unconfigured');
      })
      .catch(() => {
        if (!cancelled) setApiHealth('offline');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clampedLimit = Math.max(50, Math.min(2000, Math.round(form.maxUploadSizeMB || 300)));
    const next = { ...form, maxUploadSizeMB: clampedLimit };
    setForm(next);
    onSaveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="pb-5 border-b border-[#E5E5E5]">
        <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#171717]">
          Settings
        </h1>
        <p className="text-sm text-[#737373] mt-1">
          Manage your creator profile, studio preferences, upload size limits, and server AI
          connection.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile & Account Settings */}
        <section className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-[#171717]">
              Profile &amp; Account
            </h2>
            <p className="text-xs text-[#737373] mt-0.5">
              Personalize workspace identity and default channel branding.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="settings-name" className="text-xs font-medium text-[#525252]">
                Display Name
              </label>
              <input
                id="settings-name"
                type="text"
                required
                value={form.creatorName}
                onChange={(e) => setForm({ ...form, creatorName: e.target.value })}
                className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3.5 py-2 text-sm text-[#171717] focus:outline-none focus:border-[#DC2626]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-handle" className="text-xs font-medium text-[#525252]">
                Default Channel Handle
              </label>
              <input
                id="settings-handle"
                type="text"
                value={form.channelHandle}
                onChange={(e) => setForm({ ...form, channelHandle: e.target.value })}
                className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3.5 py-2 text-sm text-[#171717] focus:outline-none focus:border-[#DC2626]"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="settings-email" className="text-xs font-medium text-[#525252]">
                Workspace Email
              </label>
              <input
                id="settings-email"
                type="email"
                required
                value={form.creatorEmail}
                onChange={(e) => setForm({ ...form, creatorEmail: e.target.value })}
                className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3.5 py-2 text-sm text-[#171717] focus:outline-none focus:border-[#DC2626]"
              />
            </div>
          </div>
        </section>

        {/* Studio Preferences */}
        <section className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-[#171717]">
              Preferences &amp; Upload Limits
            </h2>
            <p className="text-xs text-[#737373] mt-0.5">
              Default formatting and processing limits for newly created projects.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="settings-max-upload" className="text-xs font-medium text-[#525252]">
                Max Upload File Size (MB)
              </label>
              <input
                id="settings-max-upload"
                type="number"
                min={50}
                max={2000}
                step={50}
                value={form.maxUploadSizeMB}
                onChange={(e) =>
                  setForm({ ...form, maxUploadSizeMB: Number(e.target.value) || 300 })
                }
                className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3.5 py-2 text-sm font-mono tabular-nums text-[#171717] focus:outline-none focus:border-[#DC2626]"
              />
              <p className="text-[11px] text-[#737373]">
                Default limit is 300 MB (configurable between 50 MB and 2,000 MB).
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-quality" className="text-xs font-medium text-[#525252]">
                Export Resolution Target
              </label>
              <select
                id="settings-quality"
                value={form.exportQuality}
                onChange={(e) =>
                  setForm({ ...form, exportQuality: e.target.value as '1080p' | '720p' })
                }
                className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3.5 py-2 text-sm text-[#171717] focus:outline-none focus:border-[#DC2626]"
              >
                <option value="1080p">1080p Full HD</option>
                <option value="720p">720p Fast Browser Render</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-ratio" className="text-xs font-medium text-[#525252]">
                Default Aspect Ratio
              </label>
              <select
                id="settings-ratio"
                value={form.defaultAspectRatio}
                onChange={(e) =>
                  setForm({ ...form, defaultAspectRatio: e.target.value as AspectRatio })
                }
                className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3.5 py-2 text-sm text-[#171717] focus:outline-none focus:border-[#DC2626]"
              >
                {ASPECT_RATIOS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} ({r.platforms})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-template" className="text-xs font-medium text-[#525252]">
                Default Caption Template
              </label>
              <select
                id="settings-template"
                value={form.defaultTemplateId}
                onChange={(e) =>
                  setForm({ ...form, defaultTemplateId: e.target.value as CaptionTemplateId })
                }
                className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3.5 py-2 text-sm text-[#171717] focus:outline-none focus:border-[#DC2626]"
              >
                {CAPTION_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-[#FAFAFA] border border-[#E5E5E5] px-4 py-3 sm:col-span-2">
              <div>
                <p className="text-xs font-semibold text-[#171717]">Auto-attach intro sound effect</p>
                <p className="text-[11px] text-[#737373]">
                  Apply Transition Whoosh to newly cut clips by default
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.autoAddSfx}
                aria-label="Auto-attach intro sound effect"
                onChange={(e) => setForm({ ...form, autoAddSfx: e.target.checked })}
                className="h-4 w-4 accent-[#DC2626]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16A34A]">
                <Check className="h-3.5 w-3.5" />
                Preferences saved
              </span>
            )}
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Save Preferences
            </button>
          </div>
        </section>
      </form>

      {/* API Configuration & Browser Engine Capabilities */}
      <section className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-6 space-y-5">
        <div className="flex items-start gap-3">
          <Server className="h-5 w-5 text-[#DC2626] shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-[#171717]">
                Server AI Configuration
              </h2>
              <span
                className={`text-xs font-semibold ${
                  apiHealth === 'ready'
                    ? 'text-[#16A34A]'
                    : apiHealth === 'checking'
                      ? 'text-[#737373]'
                      : 'text-[#D97706]'
                }`}
              >
                {apiHealth === 'ready'
                  ? 'Connected (Server-side Gemini API)'
                  : apiHealth === 'checking'
                    ? 'Checking endpoint...'
                    : apiHealth === 'unconfigured'
                      ? 'API Key Not Configured in Secrets'
                      : 'Endpoint Unreachable'}
              </span>
            </div>
            <p className="text-xs text-[#737373] leading-relaxed">
              Gemini AI requests run exclusively through server-side proxy endpoints
              (<code className="font-mono text-[#171717]">/api/ai/analyze-audio</code> and{' '}
              <code className="font-mono text-[#171717]">/api/ai/captions-reactions</code>) using
              environment secrets. API keys are never exposed to client JavaScript.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-[#E5E5E5] flex items-start gap-3">
          <Info className="h-5 w-5 text-[#737373] shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <h3 className="font-display text-sm font-semibold text-[#171717]">
              Browser Video Engine Capabilities
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
              <div>
                <p className="text-[#737373]">FFmpeg.wasm</p>
                <p
                  className={`mt-0.5 font-semibold ${
                    capabilities.ffmpegSupported ? 'text-[#16A34A]' : 'text-[#D97706]'
                  }`}
                >
                  {capabilities.ffmpegSupported ? 'Supported' : 'Unavailable'}
                </p>
              </div>
              <div>
                <p className="text-[#737373]">Web Workers</p>
                <p
                  className={`mt-0.5 font-semibold ${
                    capabilities.webWorkers ? 'text-[#16A34A]' : 'text-[#D97706]'
                  }`}
                >
                  {capabilities.webWorkers ? 'Supported' : 'Unavailable'}
                </p>
              </div>
              <div>
                <p className="text-[#737373]">IndexedDB Cache</p>
                <p
                  className={`mt-0.5 font-semibold ${
                    capabilities.indexedDB ? 'text-[#16A34A]' : 'text-[#D97706]'
                  }`}
                >
                  {capabilities.indexedDB ? 'Active' : 'Unavailable'}
                </p>
              </div>
              <div>
                <p className="text-[#737373]">Fallback Recorder</p>
                <p
                  className={`mt-0.5 font-semibold ${
                    capabilities.mediaRecorderMimeType ? 'text-[#16A34A]' : 'text-[#D97706]'
                  }`}
                >
                  {capabilities.mediaRecorderMimeType
                    ? capabilities.mediaRecorderMimeType.split(';')[0]
                    : 'Unavailable'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Destructive Reset Section */}
        <div className="pt-4 border-t border-[#E5E5E5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#171717]">
              Clear Local Workspace &amp; IndexedDB Cache
            </p>
            <p className="text-xs text-[#737373]">
              Permanently deletes stored uploaded videos, audio chunks, rendered MP4 blobs, and
              project records from this browser.
            </p>
          </div>

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] text-xs font-semibold text-[#DC2626] transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Clear Workspace Data</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 py-2 rounded-lg text-xs font-medium text-[#737373] hover:text-[#171717]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetWorkspaceData();
                  setConfirmReset(false);
                }}
                className="px-3.5 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-xs font-semibold text-white whitespace-nowrap"
              >
                Confirm Reset
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
