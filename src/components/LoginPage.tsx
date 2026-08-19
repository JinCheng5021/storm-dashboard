import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMsg('Email hoặc mật khẩu không chính xác.');
        } else if (error.message.includes('Email not confirmed')) {
          setErrorMsg('Tài khoản chưa được kích hoạt.');
        } else {
          setErrorMsg(error.message);
        }
      } else if (data.session) {
        onLoginSuccess?.();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Đã có lỗi xảy ra khi đăng nhập.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '20px',
      overflow: 'hidden'
    }}>
      {/* Background decoration elements */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(0, 102, 255, 0.15) 0%, rgba(0, 102, 255, 0) 70%)',
        top: '-10%',
        left: '-10%',
        borderRadius: '50%',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(245, 114, 36, 0.12) 0%, rgba(245, 114, 36, 0) 70%)',
        bottom: '-10%',
        right: '-10%',
        borderRadius: '50%',
        pointerEvents: 'none'
      }} />

      {/* Login Card */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '420px',
        background: 'rgba(255, 255, 255, 0.98)',
        borderRadius: '20px',
        padding: '36px 32px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(16px)',
        zIndex: 1
      }}>
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img
            src="/fpt-telecom-logo.svg"
            alt="FPT Telecom"
            style={{
              height: '54px',
              maxWidth: '100%',
              objectFit: 'contain',
              display: 'inline-block'
            }}
          />
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Tên đăng nhập
            </label>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94A3B8',
                fontSize: '20px'
              }}>mail</span>
              <input
                type="email"
                placeholder="vidu: AnLK2@fpt.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px 12px 40px',
                  borderRadius: '10px',
                  border: '1.5px solid #E2E8F0',
                  fontSize: '14px',
                  color: '#0F172A',
                  outline: 'none',
                  transition: 'all 0.2s',
                  background: '#F8FAFC'
                }}
                onFocus={(e) => e.target.style.borderColor = '#0066FF'}
                onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Mật khẩu
            </label>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94A3B8',
                fontSize: '20px'
              }}>lock</span>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Nhập mật khẩu..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 40px 12px 40px',
                  borderRadius: '10px',
                  border: '1.5px solid #E2E8F0',
                  fontSize: '14px',
                  color: '#0F172A',
                  outline: 'none',
                  transition: 'all 0.2s',
                  background: '#F8FAFC'
                }}
                onFocus={(e) => e.target.style.borderColor = '#0066FF'}
                onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              color: '#B91C1C',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0066FF 0%, #0044CC 100%)',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '15px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(0, 102, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '6px',
              transition: 'opacity 0.2s'
            }}
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined spin" style={{ fontSize: '20px' }}>sync</span>
                <span>Đang xác thực...</span>
              </>
            ) : (
              <>
                <span>Đăng nhập hệ thống</span>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
