import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Sparkles } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { safeAppDestination } from '../components/auth/safeAppDestination'
import { useDemoAuth } from '../state/useDemoAuth'
import { useSupabaseAuth } from '../state/useSupabaseAuth'
import './demo-login.css'

const demoSignInSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter a password to continue.'),
})

type DemoSignInValues = z.infer<typeof demoSignInSchema>

export function DemoLoginPage() {
  const { isAuthenticated, enterDemo, signOut: leaveDemo } = useDemoAuth()
  const { configured, configurationMessage, loading: authLoading, error: accountError, signIn, signUp, session } = useSupabaseAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [accountMode, setAccountMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [accountMessage, setAccountMessage] = useState<string | null>(null)
  const [accountErrorMessage, setAccountErrorMessage] = useState<string | null>(null)
  const requestedPath = new URLSearchParams(location.search).get('next')
  const destination = safeAppDestination(requestedPath)
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<DemoSignInValues>({
    resolver: zodResolver(demoSignInSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  const startDemoSession = () => {
    enterDemo()
    navigate(destination, { replace: true })
  }

  const onSubmit = async ({ email, password }: DemoSignInValues) => {
    setAccountMessage(null)
    setAccountErrorMessage(null)
    if (accountMode === 'sign-in') {
      const result = await signIn(email.trim(), password)
      reset({ email: '', password: '' })
      if (result.error) setAccountErrorMessage(result.error)
      else { leaveDemo(); navigate(destination, { replace: true }) }
      return
    }

    const result = await signUp(email.trim(), password)
    reset({ email: '', password: '' })
    if (result.error) {
      setAccountErrorMessage(result.error)
      return
    }
    if (result.confirmationRequired) {
      setAccountMessage('Supabase accepted the sign-up request. If email confirmation is enabled for this project, check your inbox to complete account setup.')
      return
    }
    leaveDemo()
    navigate(destination, { replace: true })
  }

  return (
    <main className="demo-entry-page">
      <header className="demo-entry-header">
        <Link className="demo-entry-brand" to="/" aria-label="smartBOB home">
          <span className="demo-entry-brand__mark"><img src="/smartbob-logo.jpg" alt="" /></span>
          <span className="demo-entry-brand__word"><strong>smart<span>BOB</span></strong><small>SMART CONTRACT SCANNER</small></span>
        </Link>
        <Link className="demo-entry-header__home" to="/"><ArrowLeft size={15} aria-hidden="true" /> Back to website</Link>
      </header>

      <div className="demo-entry-layout">
        <section className="demo-entry-intro" aria-labelledby="demo-entry-intro-title">
          <p className="demo-entry-eyebrow"><span aria-hidden="true" /> SMARTBOB WORKSPACE</p>
          <h1 id="demo-entry-intro-title">Explore the security workspace.</h1>
          <p className="demo-entry-intro__copy">Review example findings, source context, and remediation guidance in a frontend-only product demo.</p>
          <div className="demo-entry-proof" role="note">
            <Sparkles size={17} aria-hidden="true" />
            <span><strong>Illustrative data only</strong><small>No real contract analysis is performed.</small></span>
          </div>
        </section>

        <section className="demo-login-card" aria-labelledby="demo-login-title">
          <div className="demo-login-card__heading">
            <p className="demo-login-card__eyebrow">SUPABASE ACCOUNT</p>
            <h2 id="demo-login-title">{accountMode === 'sign-in' ? 'Sign in to your account' : 'Create an account'}</h2>
            <p>Account credentials are sent directly to Supabase Auth. smartBOB does not store passwords. Account access does not enable real contract analysis.</p>
          </div>

          <form className="demo-login-form" noValidate onSubmit={handleSubmit(onSubmit)}>
            <div className="demo-login-field">
              <label htmlFor="demo-email">Email address</label>
              <input
                id="demo-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'demo-email-error' : undefined}
                {...register('email')}
              />
              {errors.email && <p className="demo-login-field__error" id="demo-email-error" role="alert">{errors.email.message}</p>}
            </div>

            <div className="demo-login-field">
              <label htmlFor="demo-password">Password</label>
              <div className="demo-password-control">
                <input
                  id="demo-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={accountMode === 'sign-in' ? 'current-password' : 'new-password'}
                  placeholder={accountMode === 'sign-in' ? 'Enter your password' : 'Choose a password'}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'demo-password-error' : undefined}
                  {...register('password')}
                />
                <button
                  className="demo-password-toggle"
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  aria-controls="demo-password"
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
              {errors.password && <p className="demo-login-field__error" id="demo-password-error" role="alert">{errors.password.message}</p>}
            </div>

            <button className="demo-login-submit" type="submit" disabled={authLoading || isSubmitting}>
              {accountMode === 'sign-in' ? 'Sign in' : 'Create account'} <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>

          {!configured && <p className="demo-login-configuration" role="status">{configurationMessage}</p>}
          {configured && <p className="demo-login-account-note" role="note">Account mode uses the authenticated local scanner API. Demo mode remains separate and uses illustrative seeded data.</p>}
          {(accountError || accountErrorMessage) && <p className="demo-login-field__error" role="alert">{accountError ?? accountErrorMessage}</p>}
          {accountMessage && <p className="demo-login-status" role="status">{accountMessage}</p>}
          <button className="demo-login-mode-toggle" type="button" onClick={() => { setAccountMode(accountMode === 'sign-in' ? 'sign-up' : 'sign-in'); setAccountMessage(null); setAccountErrorMessage(null); reset() }}>
            {accountMode === 'sign-in' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
          </button>

          <div className="demo-login-divider" aria-hidden="true"><span>OR</span></div>
          <button className="demo-login-continue" type="button" onClick={startDemoSession}>
            {isAuthenticated ? 'Continue to Demo' : 'Continue as Demo'}
          </button>

          <p className="demo-login-disclaimer" role="note">Demo entry only — no account is created, and this option sends no credentials.</p>
          {session && <p className="demo-login-account-note" role="status">A Supabase account session is already active in this browser.</p>}

          <p className="demo-login-card__back"><Link to="/"><ArrowLeft size={14} aria-hidden="true" /> Back to smartBOB</Link></p>
        </section>
      </div>

      <footer className="demo-entry-footer">
        <span>smartBOB · Frontend demo</span>
        <span>Demo data is illustrative · account analysis uses the local worker</span>
      </footer>
    </main>
  )
}
