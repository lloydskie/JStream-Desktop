import React, { useState, useEffect, useRef } from 'react';
import { Box } from '@chakra-ui/react';

interface UserAccount {
  id: string;
  name: string;
  avatar: string;
  avatarImage?: string;
  pin: string;
  createdAt: string;
  isKid: boolean;
}

interface WelcomeScreenProps {
  onAccountSelected: (accountId: string) => void;
  onAccountCreated: (account: UserAccount & { avatarImage?: string }) => void;
}

const avatarOptions = ['👤', '🧒', '👩', '👨', '👧', '👦', '🦸', '🦹', '🧑‍🎨', '🧑‍🚀', '🐱', '🐶', '🦊', '🐼', '🎬', '🎮', '🎵', '🌟'];

export default function WelcomeScreen({ onAccountSelected, onAccountCreated }: WelcomeScreenProps) {
  const [step, setStep] = useState<'welcome' | 'features' | 'create' | 'tutorial' | 'select'>('welcome');
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountAvatar, setNewAccountAvatar] = useState('👤');
  const [newAccountAvatarImage, setNewAccountAvatarImage] = useState<string | null>(null);
  const [newAccountIsKid, setNewAccountIsKid] = useState(false);
  const [newAccountPin, setNewAccountPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [createError, setCreateError] = useState('');
  const [showRecoveryPin, setShowRecoveryPin] = useState<string | null>(null);
  const [tutorialPage, setTutorialPage] = useState(0);
  const [pendingAccount, setPendingAccount] = useState<(UserAccount & { avatarImage?: string }) | null>(null);
  const [selectedAccountForLogin, setSelectedAccountForLogin] = useState<UserAccount | null>(null);
  const [loginPinInput, setLoginPinInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryPinInput, setRecoveryPinInput] = useState('');
  const [newPinForRecovery, setNewPinForRecovery] = useState('');
  const [confirmNewPinForRecovery, setConfirmNewPinForRecovery] = useState('');
  const [featureIndex, setFeatureIndex] = useState(0);
  const [accountAvatarImages, setAccountAvatarImages] = useState<Record<string, string>>({});
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load existing accounts on mount
  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const accountsData = await (window as any).accounts?.list();
      if (accountsData && accountsData.length > 0) {
        setAccounts(accountsData);
        setStep('select');
        
        // Load avatar images for all accounts
        const avatarImages: Record<string, string> = {};
        for (const account of accountsData) {
          try {
            const avatarImage = await (window as any).accounts?.loadAvatar(account.id);
            if (avatarImage) {
              avatarImages[account.id] = avatarImage;
            }
          } catch (e) {
            // Ignore - will use emoji avatar
          }
        }
        setAccountAvatarImages(avatarImages);
      } else {
        setStep('welcome');
      }
    } catch (e) {
      console.error('Failed to load accounts', e);
      setStep('welcome');
    }
  };

  const generateRecoveryPin = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setNewAccountAvatarImage(result);
      setNewAccountAvatar(''); // Clear emoji when image is selected
    };
    reader.readAsDataURL(file);
  };

  const handleCreateAccount = async () => {
    setCreateError('');
    
    if (!newAccountName.trim()) {
      setCreateError('Please enter a name for your profile');
      return;
    }
    if (newAccountPin.length < 4) {
      setCreateError('PIN must be at least 4 digits');
      return;
    }
    if (newAccountPin !== confirmPin) {
      setCreateError('PINs do not match');
      return;
    }

    const recoveryPin = generateRecoveryPin();
    const accountId = Date.now().toString();
    const newAccount: UserAccount = {
      id: accountId,
      name: newAccountName.trim(),
      avatar: newAccountAvatarImage ? '' : newAccountAvatar, // Empty if using image
      pin: newAccountPin,
      createdAt: new Date().toISOString().split('T')[0],
      isKid: newAccountIsKid,
    };

    try {
      await (window as any).accounts?.create(newAccount, recoveryPin);
      
      // Save avatar image if one was uploaded - must complete before notifying parent
      if (newAccountAvatarImage) {
        await (window as any).accounts?.saveAvatar(accountId, newAccountAvatarImage);
      }
      
      // Save the pending account and show recovery PIN screen
      // Don't call onAccountCreated yet - wait until user acknowledges the recovery PIN
      setPendingAccount({ ...newAccount, avatarImage: newAccountAvatarImage || undefined });
      setShowRecoveryPin(recoveryPin);
    } catch (e) {
      console.error('Failed to create account', e);
      setCreateError('Failed to create account. Please try again.');
    }
  };

  const handleSelectAccount = (account: UserAccount) => {
    setSelectedAccountForLogin(account);
    setLoginPinInput('');
    setLoginError('');
    setRecoveryMode(false);
    setRecoveryPinInput('');
    setNewPinForRecovery('');
    setConfirmNewPinForRecovery('');
  };

  const handleLogin = async () => {
    if (!selectedAccountForLogin) return;
    
    try {
      const success = await (window as any).accounts?.login(selectedAccountForLogin.id, loginPinInput);
      if (success) {
        onAccountSelected(selectedAccountForLogin.id);
      } else {
        setLoginError('Incorrect PIN');
        setLoginPinInput('');
      }
    } catch (e) {
      setLoginError('Login failed. Please try again.');
    }
  };

  const handleRecoverAccount = async () => {
    if (!selectedAccountForLogin) return;
    
    if (recoveryPinInput.length !== 6) {
      setLoginError('Recovery PIN must be 6 digits');
      return;
    }
    if (newPinForRecovery.length < 4) {
      setLoginError('New PIN must be at least 4 digits');
      return;
    }
    if (newPinForRecovery !== confirmNewPinForRecovery) {
      setLoginError('New PINs do not match');
      return;
    }
    
    try {
      const success = await (window as any).accounts?.resetPin(
        selectedAccountForLogin.id,
        recoveryPinInput,
        newPinForRecovery
      );
      if (success) {
        // Auto-login after successful recovery
        await (window as any).accounts?.login(selectedAccountForLogin.id, newPinForRecovery);
        onAccountSelected(selectedAccountForLogin.id);
      } else {
        setLoginError('Invalid recovery PIN');
        setRecoveryPinInput('');
      }
    } catch (e) {
      setLoginError('Recovery failed. Please try again.');
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (confirm('Are you sure you want to delete this account? All data will be permanently lost.')) {
      try {
        await (window as any).accounts?.delete(accountId);
        loadAccounts();
        setSelectedAccountForLogin(null);
      } catch (e) {
        alert('Failed to delete account');
      }
    }
  };

  const features = [
    {
      icon: '🎬',
      title: 'Stream Movies & TV Shows',
      description: 'Access thousands of movies and TV shows with multiple player options — Aether, Boreal, Cygnus, Draco, and Eridanus. Switch players instantly if one doesn\'t load.'
    },
    {
      icon: '🛡️',
      title: 'Built-in Ad Blocker',
      description: 'Enjoy an ad-free experience with a powerful built-in ad blocker. No pop-ups, no interruptions — just pure streaming.'
    },
    {
      icon: '📺',
      title: 'Smart TV Episode Memory',
      description: 'JStream remembers exactly where you left off. Your last season and episode are saved automatically so you can pick up right where you stopped.'
    },
    {
      icon: '👨‍👩‍👧‍👦',
      title: 'Multi-Profile with Kids Mode',
      description: 'Create separate profiles for every family member. Kids profiles get built-in parental controls that filter out adult content automatically.'
    },
    {
      icon: '🔒',
      title: '100% Private & Offline',
      description: 'All your data stays on your device — no cloud, no tracking, no data collection. Each profile has its own encrypted database.'
    },
    {
      icon: '⌨️',
      title: 'Keyboard Shortcuts',
      description: 'Navigate like a pro with shortcuts: F11 for fullscreen, Ctrl+K to search, Ctrl+R to reload, Escape to close modals, and B to go home.'
    }
  ];

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100vh',
    background: 'linear-gradient(135deg, rgba(15, 15, 15, 0.85) 0%, rgba(26, 26, 46, 0.9) 50%, rgba(22, 33, 62, 0.85) 100%)',
    backgroundImage: 'url(/assets/welcome-banner.jpg)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    paddingTop: '48px',
    color: 'white',
    overflow: 'hidden',
    zIndex: 1,
  };

  // Overlay for better text readability
  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(135deg, rgba(15, 15, 15, 0.88) 0%, rgba(26, 26, 46, 0.85) 50%, rgba(22, 33, 62, 0.88) 100%)',
    zIndex: 0,
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(31, 41, 55, 0.95)',
    borderRadius: '20px',
    padding: '28px 32px',
    maxWidth: '600px',
    width: '100%',
    maxHeight: 'calc(100vh - 80px)',
    overflowY: 'auto',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(10px)',
    position: 'relative',
    zIndex: 1,
  };

  const buttonPrimaryStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    padding: '16px 32px',
    fontSize: '18px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    width: '100%',
  };

  const buttonSecondaryStyle: React.CSSProperties = {
    background: 'transparent',
    color: 'white',
    border: '2px solid #4b5563',
    borderRadius: '12px',
    padding: '14px 28px',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  };

  const inputStyle: React.CSSProperties = {
    background: '#374151',
    border: '2px solid #4b5563',
    borderRadius: '10px',
    padding: '10px 14px',
    color: 'white',
    width: '100%',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  };

  // Welcome Step
  if (step === 'welcome') {
    return (
      <div style={containerStyle}>
        <div style={overlayStyle} />
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <img src="https://quijano.pages.dev/store/files/assets/jstreamv2/original-logo-backup.png" alt="JStream" style={{ height: '100px', width: 'auto', marginBottom: '24px' }} />
            <h1 style={{ fontSize: '42px', fontWeight: 'bold', marginBottom: '16px', background: 'linear-gradient(135deg, #fff 0%, #dc2626 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Welcome to JStream
            </h1>
            <p style={{ fontSize: '18px', color: '#9ca3af', lineHeight: 1.6 }}>
              Your personal streaming companion. Watch movies and TV shows with a personalized, private experience.
            </p>
          </div>
          
          <button 
            style={buttonPrimaryStyle}
            onClick={() => setStep('features')}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            Get Started →
          </button>
        </div>
      </div>
    );
  }

  // Features Tour Step
  if (step === 'features') {
    const feature = features[featureIndex];
    return (
      <div style={containerStyle}>
        <div style={overlayStyle} />
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ fontSize: '64px', marginBottom: '24px' }}>{feature.icon}</div>
            <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>
              {feature.title}
            </h2>
            <p style={{ fontSize: '16px', color: '#9ca3af', lineHeight: 1.7, minHeight: '60px' }}>
              {feature.description}
            </p>
          </div>
          
          {/* Progress dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px' }}>
            {features.map((_, idx) => (
              <div 
                key={idx}
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: idx === featureIndex ? '#dc2626' : '#4b5563',
                  transition: 'background 0.3s',
                  cursor: 'pointer'
                }}
                onClick={() => setFeatureIndex(idx)}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            {featureIndex > 0 && (
              <button 
                style={buttonSecondaryStyle}
                onClick={() => setFeatureIndex(featureIndex - 1)}
              >
                ← Back
              </button>
            )}
            <button 
              style={{ ...buttonPrimaryStyle, flex: 1 }}
              onClick={() => {
                if (featureIndex < features.length - 1) {
                  setFeatureIndex(featureIndex + 1);
                } else {
                  setStep('create');
                }
              }}
            >
              {featureIndex < features.length - 1 ? 'Next →' : 'Create Your Account →'}
            </button>
          </div>

          <button 
            style={{ ...buttonSecondaryStyle, width: '100%', marginTop: '16px', border: 'none', color: '#9ca3af' }}
            onClick={() => setStep('create')}
          >
            Skip tour
          </button>
        </div>
      </div>
    );
  }

  // Create Account Step
  if (step === 'create') {
    if (showRecoveryPin) {
      const handleCopyRecoveryPin = () => {
        navigator.clipboard.writeText(showRecoveryPin).then(() => {
          // Show a brief "Copied!" feedback
          const btn = document.getElementById('copy-recovery-btn');
          if (btn) {
            const originalText = btn.innerText;
            btn.innerText = '✓ Copied!';
            setTimeout(() => { btn.innerText = originalText; }, 2000);
          }
        });
      };

      return (
        <div style={containerStyle}>
          <div style={overlayStyle} />
          <div style={cardStyle}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>🔐</div>
              <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>Save Your Recovery PIN</h2>
              <p style={{ color: '#9ca3af' }}>Write this down and keep it safe!</p>
            </div>

            <div style={{ 
              background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)', 
              padding: '32px', 
              borderRadius: '16px', 
              textAlign: 'center',
              marginBottom: '16px'
            }}>
              <p style={{ fontSize: '14px', color: '#fca5a5', marginBottom: '8px' }}>Your Recovery PIN</p>
              <p style={{ fontSize: '48px', fontWeight: 'bold', letterSpacing: '8px', marginBottom: '16px' }}>{showRecoveryPin}</p>
              <button
                id="copy-recovery-btn"
                onClick={handleCopyRecoveryPin}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '8px',
                  padding: '10px 24px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
              >
                📋 Copy to Clipboard
              </button>
            </div>

            <div style={{ background: '#854d0e', padding: '16px', borderRadius: '12px', marginBottom: '32px' }}>
              <p style={{ fontSize: '14px', color: '#fef08a' }}>
                ⚠️ <strong>IMPORTANT:</strong> This recovery PIN is the ONLY way to recover your account if you forget your login PIN. 
                It cannot be recovered or regenerated. Write it down and store it in a safe place.
              </p>
            </div>

            <button 
              style={buttonPrimaryStyle}
              onClick={() => {
                setShowRecoveryPin(null);
                setTutorialPage(0);
                setStep('tutorial');
              }}
            >
              I've Saved My Recovery PIN →
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={containerStyle}>
        <div style={overlayStyle} />
        <div style={{ ...cardStyle, maxWidth: '520px', padding: '20px 28px' }}>
          <div style={{ textAlign: 'center', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '4px' }}>Create Your Profile</h2>
            <p style={{ color: '#9ca3af', fontSize: '13px' }}>Set up your personalized account</p>
          </div>

          {/* Avatar selection — compact row */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
              {/* Avatar preview */}
              <div style={{
                width: '64px',
                height: '64px',
                minWidth: '64px',
                borderRadius: '50%',
                border: '3px solid #dc2626',
                background: '#374151',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {newAccountAvatarImage ? (
                  <img src={newAccountAvatarImage} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '32px' }}>{newAccountAvatar}</span>
                )}
              </div>

              {/* Upload button */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '6px 14px',
                    background: newAccountAvatarImage ? '#059669' : '#374151',
                    color: 'white',
                    border: '1px solid #4b5563',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  📷 {newAccountAvatarImage ? 'Change' : 'Upload Photo'}
                </button>
                {newAccountAvatarImage && (
                  <button
                    onClick={() => {
                      setNewAccountAvatarImage(null);
                      setNewAccountAvatar('👤');
                    }}
                    style={{
                      padding: '6px 14px',
                      background: 'transparent',
                      color: '#f87171',
                      border: '1px solid #f87171',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Emoji avatars — compact grid */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
              {avatarOptions.map(av => (
                <button
                  key={av}
                  onClick={() => {
                    setNewAccountAvatar(av);
                    setNewAccountAvatarImage(null);
                  }}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    border: !newAccountAvatarImage && newAccountAvatar === av ? '2px solid #dc2626' : '1px solid #4b5563',
                    background: !newAccountAvatarImage && newAccountAvatar === av ? 'rgba(220, 38, 38, 0.2)' : '#374151',
                    fontSize: '18px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    padding: 0,
                  }}
                >
                  {av}
                </button>
              ))}
            </div>
          </div>

          {/* Name input */}
          <div style={{ marginBottom: '10px' }}>
            <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '4px' }}>Profile Name</p>
            <input
              type="text"
              value={newAccountName}
              onChange={(e) => { setNewAccountName(e.target.value); setCreateError(''); }}
              placeholder="Enter your name"
              style={inputStyle}
            />
          </div>

          {/* PIN fields side by side */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '4px' }}>Create PIN (4+ digits)</p>
              <input
                type="password"
                value={newAccountPin}
                onChange={(e) => { setNewAccountPin(e.target.value.replace(/\D/g, '')); setCreateError(''); }}
                placeholder="PIN"
                maxLength={8}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '4px' }}>Confirm PIN</p>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, '')); setCreateError(''); }}
                placeholder="Confirm"
                maxLength={8}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Error message */}
          {createError && (
            <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '10px', textAlign: 'center', padding: '8px', background: 'rgba(248, 113, 113, 0.1)', borderRadius: '8px' }}>
              {createError}
            </p>
          )}

          {/* Kids profile toggle — compact */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', padding: '10px 14px', background: '#374151', borderRadius: '10px' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: '14px' }}>Kids Profile</p>
              <p style={{ fontSize: '12px', color: '#9ca3af' }}>Enable parental controls</p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
              <input 
                type="checkbox" 
                checked={newAccountIsKid} 
                onChange={(e) => setNewAccountIsKid(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                cursor: 'pointer',
                top: 0, left: 0, right: 0, bottom: 0,
                background: newAccountIsKid ? '#dc2626' : '#4b5563',
                borderRadius: '24px',
                transition: '0.3s'
              }}>
                <span style={{
                  position: 'absolute',
                  height: '18px', width: '18px',
                  left: newAccountIsKid ? '26px' : '3px',
                  bottom: '3px',
                  background: 'white',
                  borderRadius: '50%',
                  transition: '0.3s'
                }} />
              </span>
            </label>
          </div>

          <button style={{ ...buttonPrimaryStyle, padding: '12px 24px', fontSize: '15px' }} onClick={handleCreateAccount}>
            Create Account
          </button>

          {accounts.length > 0 && (
            <button 
              style={{ ...buttonSecondaryStyle, width: '100%', marginTop: '10px', padding: '10px 20px', fontSize: '14px' }}
              onClick={() => setStep('select')}
            >
              ← Back to Account Selection
            </button>
          )}
        </div>
      </div>
    );
  }

  // Tutorial/Instructions Step (shown after account creation)
  if (step === 'tutorial') {
    const tutorialPages = [
      {
        icon: '🎬',
        title: 'Welcome to JStream!',
        content: (
          <div style={{ textAlign: 'left' }}>
            <p style={{ marginBottom: '16px', lineHeight: 1.7 }}>
              JStream is your personal, private streaming companion. Watch movies and TV shows without ads, 
              without VPNs, and without any data collection.
            </p>
            <div style={{ background: '#1f2937', padding: '16px', borderRadius: '12px' }}>
              <p style={{ fontWeight: 600, marginBottom: '8px', color: '#dc2626' }}>✨ Key Features:</p>
              <ul style={{ paddingLeft: '20px', lineHeight: 1.8 }}>
                <li><strong>Ad-Free</strong> – Built-in ad blocker for uninterrupted viewing</li>
                <li><strong>No VPN Required</strong> – Stream directly without hassle</li>
                <li><strong>100% Private</strong> – Your data stays on your device</li>
                <li><strong>Multiple Players</strong> – 5 player options to choose from</li>
                <li><strong>Episode Memory</strong> – Remembers your last TV episode</li>
                <li><strong>Kids Mode</strong> – Built-in parental controls per profile</li>
              </ul>
            </div>
          </div>
        )
      },
      {
        icon: '🧭',
        title: 'Navigating the App',
        content: (
          <div style={{ textAlign: 'left' }}>
            <p style={{ marginBottom: '16px', lineHeight: 1.7 }}>
              Use the navigation tabs at the top to explore different sections:
            </p>
            <div style={{ display: 'grid', gap: '12px' }}>
              {[
                { tab: 'Home', desc: 'Your personalized homepage with recommendations', icon: '🏠' },
                { tab: 'Shows', desc: 'Browse all TV series and shows', icon: '📺' },
                { tab: 'Movies', desc: 'Explore the movie library', icon: '🎬' },
                { tab: 'New & Popular', desc: 'Latest releases and trending titles', icon: '🔥' },
                { tab: 'My List', desc: 'Your saved favorites and watch later', icon: '📋' },
                { tab: 'Browse by Languages', desc: 'Find content in specific languages', icon: '🌍' },
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#1f2937', padding: '12px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '20px' }}>{item.icon}</span>
                  <div>
                    <p style={{ fontWeight: 600, color: '#dc2626' }}>{item.tab}</p>
                    <p style={{ fontSize: '13px', color: '#9ca3af' }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      },
      {
        icon: '🎮',
        title: 'How to Watch',
        content: (
          <div style={{ textAlign: 'left' }}>
            <p style={{ marginBottom: '16px', lineHeight: 1.7 }}>
              Getting started is easy — follow these steps:
            </p>
            <ol style={{ paddingLeft: '20px', lineHeight: 2.2 }}>
              <li><strong>Browse</strong> – Scroll through the homepage or use tabs to find content</li>
              <li><strong>Search</strong> – Press <kbd style={{ background: '#374151', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>Ctrl+K</kbd> or click 🔍 to search by title</li>
              <li><strong>Select</strong> – Click on any movie or show to see details</li>
              <li><strong>Play</strong> – Hit the Play button to start watching</li>
              <li><strong>Switch Players</strong> – Use the player tabs (Aether, Boreal, Cygnus, Draco, Eridanus) if one doesn't load</li>
            </ol>
            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
              <div style={{ background: '#1f2937', padding: '12px', borderRadius: '8px' }}>
                <p style={{ fontSize: '13px', color: '#9ca3af' }}>
                  📺 <strong>TV Shows:</strong> After clicking Play, select your season and episode from the dropdowns. JStream remembers where you left off!
                </p>
              </div>
              <div style={{ background: '#1f2937', padding: '12px', borderRadius: '8px' }}>
                <p style={{ fontSize: '13px', color: '#9ca3af' }}>
                  🔄 <strong>Player not loading?</strong> Try switching to a different player using the tabs above the video. Each player uses a different source.
                </p>
              </div>
              <div style={{ background: '#1f2937', padding: '12px', borderRadius: '8px' }}>
                <p style={{ fontSize: '13px', color: '#9ca3af' }}>
                  🔃 <strong>Something stuck?</strong> Press <kbd style={{ background: '#374151', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>Ctrl+R</kbd> to reload the app at any time.
                </p>
              </div>
            </div>
          </div>
        )
      },
      {
        icon: '⌨️',
        title: 'Keyboard Shortcuts',
        content: (
          <div style={{ textAlign: 'left' }}>
            <p style={{ marginBottom: '16px', lineHeight: 1.7 }}>
              Master these shortcuts to navigate faster:
            </p>
            <div style={{ display: 'grid', gap: '8px' }}>
              {[
                { keys: 'F11', action: 'Toggle fullscreen mode' },
                { keys: 'Escape', action: 'Exit fullscreen / Close modals' },
                { keys: 'Ctrl + K', action: 'Open search' },
                { keys: 'Ctrl + R', action: 'Reload the app' },
                { keys: 'B', action: 'Go back to Home' },
              ].map((shortcut, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1f2937', padding: '12px 16px', borderRadius: '8px' }}>
                  <span style={{ color: '#9ca3af' }}>{shortcut.action}</span>
                  <kbd style={{ background: '#374151', padding: '6px 12px', borderRadius: '6px', fontFamily: 'monospace', fontWeight: 600, border: '1px solid #4b5563' }}>{shortcut.keys}</kbd>
                </div>
              ))}
            </div>
            <div style={{ background: '#1f2937', padding: '12px', borderRadius: '8px', marginTop: '16px' }}>
              <p style={{ fontSize: '13px', color: '#9ca3af' }}>
                💡 <strong>Tip:</strong> These shortcuts work globally — no need to click anywhere first. Single-key shortcuts (like B) are disabled while you're typing in a text field.
              </p>
            </div>
          </div>
        )
      },
      {
        icon: '⚙️',
        title: 'Your Profile & Settings',
        content: (
          <div style={{ textAlign: 'left' }}>
            <p style={{ marginBottom: '16px', lineHeight: 1.7 }}>
              Manage your account from the Profile page (click your avatar in the header):
            </p>
            <div style={{ display: 'grid', gap: '12px' }}>
              {[
                { title: 'Edit Profile', desc: 'Change your name, avatar, or upload a photo', icon: '👤' },
                { title: 'Change PIN', desc: 'Update your login PIN anytime', icon: '🔐' },
                { title: 'My List', desc: 'View and manage your saved favorites', icon: '❤️' },
                { title: 'Watch History', desc: 'See what you\'ve watched recently', icon: '📜' },
                { title: 'Kids Mode', desc: 'Enable parental controls on any profile', icon: '👶' },
                { title: 'Switch Profile', desc: 'Log out and switch to another profile', icon: '🔄' },
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#1f2937', padding: '12px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '20px' }}>{item.icon}</span>
                  <div>
                    <p style={{ fontWeight: 600 }}>{item.title}</p>
                    <p style={{ fontSize: '13px', color: '#9ca3af' }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      },
      {
        icon: '🚀',
        title: 'You\'re All Set!',
        content: (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '18px', marginBottom: '24px', lineHeight: 1.7 }}>
              You're ready to start streaming! Remember:
            </p>
            <div style={{ display: 'grid', gap: '12px', textAlign: 'left' }}>
              {[
                { icon: '🔒', text: 'Your data stays private — everything is stored locally' },
                { icon: '📋', text: 'Keep your Recovery PIN safe for account recovery' },
                { icon: '🎬', text: 'Try different players (Aether, Boreal, Cygnus, Draco, Eridanus) if one doesn\'t work' },
                { icon: '📺', text: 'TV progress is saved — JStream remembers your last episode' },
                { icon: '❤️', text: 'Add favorites by clicking the heart icon on any title' },
                { icon: '🔃', text: 'Press Ctrl+R to reload if anything gets stuck' },
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#1f2937', padding: '14px 16px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '24px' }}>{item.icon}</span>
                  <span style={{ fontSize: '15px' }}>{item.text}</span>
                </div>
              ))}
            </div>
            <p style={{ marginTop: '24px', color: '#9ca3af', fontSize: '15px' }}>
              Enjoy your streaming experience! 🎉
            </p>
          </div>
        )
      }
    ];

    const currentPage = tutorialPages[tutorialPage];
    const isLastPage = tutorialPage === tutorialPages.length - 1;

    return (
      <div style={containerStyle}>
        <div style={overlayStyle} />
        <div style={{ ...cardStyle, maxWidth: '600px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>{currentPage.icon}</div>
            <h2 style={{ fontSize: '26px', fontWeight: 'bold', marginBottom: '8px' }}>{currentPage.title}</h2>
          </div>

          <div style={{ color: '#d1d5db', marginBottom: '24px', maxHeight: '350px', overflowY: 'auto', paddingRight: '8px' }}>
            {currentPage.content}
          </div>

          {/* Progress dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
            {tutorialPages.map((_, idx) => (
              <div 
                key={idx}
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: idx === tutorialPage ? '#dc2626' : '#4b5563',
                  transition: 'background 0.3s',
                  cursor: 'pointer'
                }}
                onClick={() => setTutorialPage(idx)}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            {tutorialPage > 0 && (
              <button 
                style={{ ...buttonSecondaryStyle, flex: 1 }}
                onClick={() => setTutorialPage(tutorialPage - 1)}
              >
                ← Previous
              </button>
            )}
            
            {!isLastPage ? (
              <button 
                style={{ ...buttonPrimaryStyle, flex: 1 }}
                onClick={() => setTutorialPage(tutorialPage + 1)}
              >
                Next →
              </button>
            ) : (
              <button 
                style={{ ...buttonPrimaryStyle, flex: 1 }}
                onClick={() => {
                  // Complete account creation
                  if (pendingAccount) {
                    onAccountCreated(pendingAccount);
                    setPendingAccount(null);
                  }
                }}
              >
                Start Streaming! 🎬
              </button>
            )}
          </div>

          {/* Skip option */}
          {!isLastPage && (
            <button
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: '#6b7280', 
                cursor: 'pointer', 
                marginTop: '16px',
                fontSize: '14px',
                width: '100%'
              }}
              onClick={() => {
                if (pendingAccount) {
                  onAccountCreated(pendingAccount);
                  setPendingAccount(null);
                }
              }}
            >
              Skip Tutorial
            </button>
          )}
        </div>
      </div>
    );
  }

  // Account Selection Step
  if (step === 'select') {
    if (selectedAccountForLogin) {
      return (
        <div style={containerStyle}>
          <div style={overlayStyle} />
          <div style={cardStyle}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              {accountAvatarImages[selectedAccountForLogin.id] ? (
                <img 
                  src={accountAvatarImages[selectedAccountForLogin.id]} 
                  style={{ 
                    width: '100px', 
                    height: '100px', 
                    borderRadius: '50%', 
                    objectFit: 'cover', 
                    marginBottom: '16px',
                    border: '3px solid #374151',
                    margin: '0 auto 16px'
                  }} 
                  alt={selectedAccountForLogin.name}
                />
              ) : (
                <div style={{ fontSize: '80px', marginBottom: '16px' }}>{selectedAccountForLogin.avatar || '👤'}</div>
              )}
              <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>{selectedAccountForLogin.name}</h2>
              <p style={{ color: '#9ca3af' }}>Enter your PIN to continue</p>
            </div>

            {!recoveryMode ? (
              <>
                <div style={{ marginBottom: '24px' }}>
                  <input
                    type="password"
                    value={loginPinInput}
                    onChange={(e) => {
                      setLoginPinInput(e.target.value.replace(/\D/g, ''));
                      setLoginError('');
                    }}
                    placeholder="Enter PIN"
                    maxLength={8}
                    style={{ ...inputStyle, textAlign: 'center', fontSize: '24px', letterSpacing: '8px' }}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    autoFocus
                  />
                  {loginError && <p style={{ color: '#f87171', fontSize: '14px', marginTop: '8px', textAlign: 'center' }}>{loginError}</p>}
                </div>

                <button style={buttonPrimaryStyle} onClick={handleLogin}>
                  Sign In
                </button>

                <button 
                  style={{ 
                    background: 'transparent', 
                    border: 'none', 
                    color: '#60a5fa', 
                    cursor: 'pointer', 
                    marginTop: '16px',
                    fontSize: '14px',
                    textDecoration: 'underline'
                  }}
                  onClick={() => { setRecoveryMode(true); setLoginError(''); }}
                >
                  Forgot PIN?
                </button>

                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <button 
                    style={{ ...buttonSecondaryStyle, flex: 1 }}
                    onClick={() => setSelectedAccountForLogin(null)}
                  >
                    ← Back
                  </button>
                  <button 
                    style={{ ...buttonSecondaryStyle, flex: 1, color: '#f87171', borderColor: '#f87171' }}
                    onClick={() => handleDeleteAccount(selectedAccountForLogin.id)}
                  >
                    Delete Account
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Enter your 6-digit Recovery PIN</p>
                  <input
                    type="password"
                    value={recoveryPinInput}
                    onChange={(e) => { setRecoveryPinInput(e.target.value.replace(/\D/g, '')); setLoginError(''); }}
                    placeholder="Recovery PIN"
                    maxLength={6}
                    style={{ ...inputStyle, textAlign: 'center', fontSize: '20px', letterSpacing: '6px' }}
                    autoFocus
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Create a new PIN</p>
                  <input
                    type="password"
                    value={newPinForRecovery}
                    onChange={(e) => { setNewPinForRecovery(e.target.value.replace(/\D/g, '')); setLoginError(''); }}
                    placeholder="New PIN"
                    maxLength={8}
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Confirm new PIN</p>
                  <input
                    type="password"
                    value={confirmNewPinForRecovery}
                    onChange={(e) => { setConfirmNewPinForRecovery(e.target.value.replace(/\D/g, '')); setLoginError(''); }}
                    placeholder="Confirm new PIN"
                    maxLength={8}
                    style={inputStyle}
                  />
                </div>

                {loginError && <p style={{ color: '#f87171', fontSize: '14px', marginBottom: '16px', textAlign: 'center' }}>{loginError}</p>}

                <button style={buttonPrimaryStyle} onClick={handleRecoverAccount}>
                  Reset PIN & Sign In
                </button>

                <button 
                  style={{ ...buttonSecondaryStyle, width: '100%', marginTop: '16px' }}
                  onClick={() => { setRecoveryMode(false); setLoginError(''); setRecoveryPinInput(''); setNewPinForRecovery(''); setConfirmNewPinForRecovery(''); }}
                >
                  ← Back to Login
                </button>
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <div style={containerStyle}>
        <div style={overlayStyle} />
        <div style={{ ...cardStyle, maxWidth: '800px' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h1 style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '8px' }}>Who's Watching?</h1>
            <p style={{ color: '#9ca3af' }}>Select your profile to continue</p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', justifyContent: 'center', marginBottom: '40px' }}>
            {accounts.map(account => (
              <div
                key={account.id}
                onClick={() => handleSelectAccount(account)}
                style={{
                  width: '140px',
                  padding: '24px 16px',
                  background: '#374151',
                  borderRadius: '16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  border: '3px solid transparent',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.borderColor = '#dc2626';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.borderColor = 'transparent';
                }}
              >
                {accountAvatarImages[account.id] ? (
                  <img 
                    src={accountAvatarImages[account.id]} 
                    style={{ 
                      width: '80px', 
                      height: '80px', 
                      borderRadius: '50%', 
                      objectFit: 'cover', 
                      marginBottom: '12px',
                      border: '3px solid #374151'
                    }} 
                    alt={account.name}
                  />
                ) : (
                  <div style={{ fontSize: '56px', marginBottom: '12px' }}>{account.avatar || '👤'}</div>
                )}
                <p style={{ fontWeight: 600, marginBottom: '4px' }}>{account.name}</p>
                {account.isKid && (
                  <span style={{ fontSize: '10px', background: '#3b82f6', padding: '2px 8px', borderRadius: '9999px' }}>
                    KIDS
                  </span>
                )}
              </div>
            ))}

            {/* Add new profile */}
            <div
              onClick={() => {
                setNewAccountName('');
                setNewAccountPin('');
                setConfirmPin('');
                setNewAccountAvatar('👤');
                setNewAccountIsKid(false);
                setStep('create');
              }}
              style={{
                width: '140px',
                padding: '24px 16px',
                background: 'transparent',
                border: '3px dashed #4b5563',
                borderRadius: '16px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = '#dc2626';
                e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = '#4b5563';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{ fontSize: '56px', marginBottom: '12px', opacity: 0.5 }}>➕</div>
              <p style={{ fontWeight: 600, color: '#9ca3af' }}>Add Profile</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
