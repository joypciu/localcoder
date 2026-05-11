import type { PermissionRequest } from "@localcoder-ai/sdk/v2"

export type PermissionBannerProps = {
  request: PermissionRequest
  onReply: (reply: "once" | "always" | "reject") => void
}

export function PermissionBanner(props: PermissionBannerProps) {
  const patterns = props.request.patterns.slice(0, 3).join(", ")
  const more = props.request.patterns.length > 3 ? ` +${props.request.patterns.length - 3}` : ""

  return (
    <div class="lc-permission" data-testid="permission-banner">
      <div class="lc-permission-title">Permission required</div>
      <div class="lc-permission-body">
        <span class="lc-permission-kind">{props.request.permission}</span>
        {patterns && (
          <span class="lc-permission-patterns" title={props.request.patterns.join("\n")}>
            {patterns}
            {more}
          </span>
        )}
      </div>
      <div class="lc-permission-actions">
        <button type="button" data-testid="perm-once" onClick={() => props.onReply("once")}>
          Allow once
        </button>
        <button type="button" class="secondary" data-testid="perm-always" onClick={() => props.onReply("always")}>
          Always
        </button>
        <button type="button" class="secondary" data-testid="perm-reject" onClick={() => props.onReply("reject")}>
          Deny
        </button>
      </div>
    </div>
  )
}
