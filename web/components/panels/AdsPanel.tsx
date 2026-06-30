'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Dropdown } from '../Dropdown';
import { api, type ActionResult } from '../../lib/apiClient';
import { fmtInt } from '../../lib/format';
import type { AdsPanelProps } from '../contracts';
import type { AdsEstimate } from '../../lib/types';

type Platform = 'google' | 'meta';

const PLATFORM_LABEL: Record<Platform, string> = { google: 'Google Ads', meta: 'Meta Ads' };

/**
 * Build the sentence the marketer reads in the confirm gate, right before a (dry-run) send.
 *
 * @param platformLabel human label for the destination, e.g. "Google Ads"
 * @param count         audience size that would be uploaded
 * @param reach         how many of those have a usable identifier, or null when no
 *                      estimate has been run yet (so the match rate is still unknown)
 */
function adsConfirmSummary(platformLabel: string, count: number, reach: number | null): string {
  return reach !== null
    ? `Upload ${fmtInt(count)} customers to ${platformLabel}? ${fmtInt(reach)} have a usable identifier.`
    : `Upload ${fmtInt(count)} customers to ${platformLabel}? Run an estimate first to see how many can be matched.`;
}

/**
 * Send-to-Ads panel (port of setupAds/doAdsEstimate/doAdsSend in static/app.js).
 *
 * PROTOTYPE: the send is always a DRY RUN — the server hashes PII and logs the platform
 * payload instead of calling Google/Meta. The "Estimate" predicts a match-rate range from
 * identifier coverage; it is an estimate, NOT a platform-reported rate. The dry-run badge
 * keeps that unmistakable.
 */
export function AdsPanel({ payload, lastCount }: AdsPanelProps) {
  const [platform, setPlatform] = useState<Platform>('google');
  const [estimate, setEstimate] = useState<AdsEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sendResult, setSendResult] = useState<ActionResult | null>(null);

  const pickPlatform = (p: Platform) => {
    setPlatform(p);
    setConfirming(false); // a pending confirm would describe the old platform/estimate
  };

  const doEstimate = async () => {
    setEstimating(true);
    setEstimateError(null);
    setSendResult(null);
    try {
      const d = await api.adsEstimate(payload, [platform]);
      if (d.error) {
        setEstimate(null);
        setEstimateError(d.error);
        return;
      }
      setEstimate(d);
    } catch (e) {
      setEstimate(null);
      setEstimateError(String(e));
    } finally {
      setEstimating(false);
    }
  };

  const doSend = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const data = await api.adsSend(payload, platform);
      setSendResult(data);
    } catch (e) {
      setSendResult({ error: String(e) });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  const cov = estimate?.coverage;
  const rate = estimate?.platforms?.[platform];
  const ok = sendResult ? !sendResult.error : false;
  const note = sendResult ? sendResult.error || sendResult.message || 'Done.' : '';

  // Prefer the estimate's count when present; fall back to the live audience size.
  const sendCount = estimate?.audienceCount ?? lastCount ?? 0;
  const reachable = estimate?.coverage?.hasAnyIdentifier ?? null;

  return (
    <Dropdown label="Send to Ads" icon={<Send size={15} />}>
      {() => (
        <>
          <div className="export-head">
            Send to ad platform <span className="ads-mode">Dry run</span>
          </div>
          <div className="export-row">
            <span className="export-lbl">Platform</span>
            <div className="export-fmt">
              <label>
                <input
                  type="radio"
                  name="adsplatform"
                  value="google"
                  checked={platform === 'google'}
                  onChange={() => pickPlatform('google')}
                />{' '}
                Google Ads
              </label>
              <label>
                <input
                  type="radio"
                  name="adsplatform"
                  value="meta"
                  checked={platform === 'meta'}
                  onChange={() => pickPlatform('meta')}
                />{' '}
                Meta Ads
              </label>
            </div>
          </div>
          <div className="ads-estimate">
            {estimating ? (
              <div className="ads-hint">Estimating…</div>
            ) : estimateError ? (
              <div className="ads-hint">{estimateError}</div>
            ) : estimate && rate && cov ? (
              <>
                <div className="ads-rate">
                  {(rate.lowPct || 0).toFixed(1)}–{(rate.highPct || 0).toFixed(1)}%
                  <span className="ads-rate-sub">
                    predicted match ({fmtInt(rate.lowCount || 0)}–{fmtInt(rate.highCount || 0)} of{' '}
                    {fmtInt(cov.total || 0)})
                  </span>
                </div>
                <div className="ads-covs">
                  <div className="ads-cov">
                    <span>Email</span>
                    <b>{fmtInt(cov.hasEmail || 0)}</b>
                  </div>
                  <div className="ads-cov">
                    <span>Phone</span>
                    <b>{fmtInt(cov.hasPhone || 0)}</b>
                  </div>
                  <div className="ads-cov">
                    <span>Name + ZIP</span>
                    <b>{fmtInt(cov.hasNameZip || 0)}</b>
                  </div>
                  <div className="ads-cov">
                    <span>Any identifier</span>
                    <b>{fmtInt(cov.hasAnyIdentifier || 0)}</b>
                  </div>
                </div>
                {rate.disclaimer ? <div className="ads-disclaimer">{rate.disclaimer}</div> : null}
              </>
            ) : (
              <div className="ads-hint">Estimate the predicted customer match rate before uploading.</div>
            )}
          </div>
          {confirming ? (
            <div className="confirm-gate">
              <div className="confirm-summary">{adsConfirmSummary(PLATFORM_LABEL[platform], sendCount, reachable)}</div>
              <div className="confirm-actions">
                <button type="button" className="btn-ghost" disabled={sending} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button type="button" className="btn-download" disabled={sending} onClick={doSend}>
                  {sending ? 'Sending…' : 'Confirm dry-run send'}
                </button>
              </div>
            </div>
          ) : (
            <div className="export-foot">
              <span className={ok ? 'export-note ok' : 'export-note'}>{note}</span>
              <button type="button" className="btn-ghost" disabled={estimating} onClick={doEstimate}>
                {estimating ? 'Estimating…' : 'Estimate'}
              </button>
              <button
                type="button"
                className="btn-download"
                disabled={sending || sendCount === 0}
                onClick={() => setConfirming(true)}
              >
                Dry-run send
              </button>
            </div>
          )}
        </>
      )}
    </Dropdown>
  );
}
