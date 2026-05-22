import { ComponentProps } from "solid-js"

/** LC monogram — hybrid terminal frame + code bracket (LocalCoder identity). */
export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        data-slot="logo-mark-frame"
        d="M14 2H2V18H14V2ZM16 20H0V0H16V20Z"
        fill="var(--icon-strong-base)"
      />
      <path data-slot="logo-mark-l-shadow" d="M9 14H3V11H6V14H9Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-mark-l" d="M6 5H3V14H6V5Z" fill="var(--icon-base)" />
      <path data-slot="logo-mark-c-top" d="M13 5H10V8H13V5Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-mark-c-mid" d="M13 8H10V12H13V8Z" fill="var(--icon-base)" />
      <path data-slot="logo-mark-c-bottom" d="M13 12H10V15H13V12Z" fill="var(--icon-weak-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M70 10H10V90H70V10ZM80 100H0V0H80V100Z" fill="var(--icon-strong-base)" />
      <path d="M45 70H15V55H30V70H45Z" fill="var(--icon-weak-base)" />
      <path d="M30 25H15V70H30V25Z" fill="var(--icon-base)" />
      <path d="M65 25H50V40H65V25Z" fill="var(--icon-weak-base)" />
      <path d="M65 40H50V60H65V40Z" fill="var(--icon-base)" />
      <path d="M65 60H50V75H65V60Z" fill="var(--icon-weak-base)" />
    </svg>
  )
}

/** Full wordmark: LC mark + geometric LOCALCODER letterforms. */
export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 248 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
      role="img"
      aria-label="LocalCoder"
    >
      <g transform="translate(0 3) scale(0.36)">
        <path d="M70 10H10V90H70V10ZM80 100H0V0H80V100Z" fill="var(--icon-strong-base)" />
        <path d="M45 70H15V55H30V70H45Z" fill="var(--icon-weak-base)" />
        <path d="M30 25H15V70H30V25Z" fill="var(--icon-base)" />
        <path d="M65 25H50V40H65V25Z" fill="var(--icon-weak-base)" />
        <path d="M65 40H50V60H65V40Z" fill="var(--icon-base)" />
        <path d="M65 60H50V75H65V60Z" fill="var(--icon-weak-base)" />
      </g>
      <g fill="var(--icon-base)">
        <path d="M34 30H28V12H34V30ZM40 36H22V6H40V36Z" />
        <path d="M58 30H46V24H58V30ZM46 30H58V12H46V30ZM64 36H46V42H40V6H64V36Z" />
        <path d="M88 30H76V18H88V30ZM76 30H88V12H76V30ZM94 36H70V6H94V36Z" />
        <path d="M118 30H106V18H118V30ZM106 30H118V12H106V30ZM124 36H100V6H124V36Z" />
        <path d="M154 30H136V18H154V30ZM136 30H154V12H136V30ZM160 36H130V6H160V36Z" />
        <path d="M184 30H172V18H184V30ZM172 30H184V12H172V30ZM190 36H166V6H190V36Z" />
        <path d="M214 30H202V18H214V30ZM202 30H214V12H202V30ZM220 36H196V6H214V0H220V36Z" />
        <path d="M248 24V30H230V24H248ZM230 12V18H242V12H230ZM248 24H230V30H248V36H224V6H248V24Z" />
      </g>
    </svg>
  )
}
