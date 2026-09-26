/**
 * Clerk ships no official Khmer (km-KH) locale in @clerk/localizations.
 * This is a hand-translated partial resource covering the sign-in flow this
 * app actually uses (email/password + email code + forgot password).
 * Clerk merges partial resources with its English defaults, so anything not
 * listed here (sign-up, SSO, organizations, billing, ...) falls back to
 * English instead of breaking.
 */
export const khKH = {
  locale: 'km-KH',
  backButton: 'ត្រឡប់ក្រោយ',
  dividerText: 'ឬ',
  footerPageLink__help: 'ជំនួយ',
  footerPageLink__privacy: 'ភាពឯកជន',
  footerPageLink__terms: 'លក្ខខណ្ឌ',
  formButtonPrimary: 'បន្ត',
  formButtonPrimary__verify: 'ផ្ទៀងផ្ទាត់',
  formFieldLabel__emailAddress: 'អាសយដ្ឋានអ៊ីមែល',
  formFieldLabel__emailAddress_username: 'អាសយដ្ឋានអ៊ីមែល ឬឈ្មោះអ្នកប្រើប្រាស់',
  formFieldLabel__password: 'ពាក្យសម្ងាត់',
  formFieldInputPlaceholder__emailAddress: 'បញ្ចូលអាសយដ្ឋានអ៊ីមែលរបស់អ្នក',
  formFieldInputPlaceholder__emailAddress_username: 'បញ្ចូលអ៊ីមែល ឬឈ្មោះអ្នកប្រើប្រាស់',
  formFieldInputPlaceholder__password: 'បញ្ចូលពាក្យសម្ងាត់របស់អ្នក',
  formFieldAction__forgotPassword: 'ភ្លេចពាក្យសម្ងាត់?',
  formFieldAction__hidePassword: 'លាក់ពាក្យសម្ងាត់',
  formFieldAction__showPassword: 'បង្ហាញពាក្យសម្ងាត់',
  socialButtonsBlockButton: 'បន្តជាមួយ {{provider|titleize}}',
  signInEnterPasswordTitle: 'បញ្ចូលពាក្យសម្ងាត់របស់អ្នក',
  signIn: {
    start: {
      actionLink: 'ចុះឈ្មោះ',
      actionLink__join_waitlist: 'ចូលរួមបញ្ជីរង់ចាំ',
      actionLink__use_email: 'ប្រើអ៊ីមែល',
      actionLink__use_email_username: 'ប្រើអ៊ីមែល ឬឈ្មោះអ្នកប្រើប្រាស់',
      actionLink__use_passkey: 'ប្រើ Passkey ជំនួសវិញ',
      actionLink__use_phone: 'ប្រើទូរស័ព្ទ',
      actionLink__use_username: 'ប្រើឈ្មោះអ្នកប្រើប្រាស់',
      actionText: 'មិនទាន់មានគណនី?',
      actionText__join_waitlist: 'ចង់បានសិទ្ធិចូលប្រើមុន?',
      subtitle: 'សូមស្វាគមន៍ត្រឡប់មកវិញ! សូមចូលគណនីដើម្បីបន្ត',
      title: 'ចូលគណនីទៅកាន់ {{applicationName}}',
      titleCombined: 'បន្តទៅកាន់ {{applicationName}}',
    },
    password: {
      actionLink: 'ប្រើវិធីផ្សេងទៀត',
      subtitle: 'បញ្ចូលពាក្យសម្ងាត់ដែលភ្ជាប់ជាមួយគណនីរបស់អ្នក',
      title: 'បញ្ចូលពាក្យសម្ងាត់របស់អ្នក',
    },
    emailCode: {
      formTitle: 'លេខកូដផ្ទៀងផ្ទាត់',
      resendButton: 'មិនទទួលបានលេខកូដទេ? ផ្ញើម្តងទៀត',
      subtitle: 'ដើម្បីបន្តទៅកាន់ {{applicationName}}',
      title: 'ពិនិត្យអ៊ីមែលរបស់អ្នក',
    },
    phoneCode: {
      formTitle: 'លេខកូដផ្ទៀងផ្ទាត់',
      resendButton: 'មិនទទួលបានលេខកូដទេ? ផ្ញើម្តងទៀត',
      subtitle: 'ដើម្បីបន្តទៅកាន់ {{applicationName}}',
      title: 'ពិនិត្យទូរស័ព្ទរបស់អ្នក',
    },
    forgotPassword: {
      formTitle: 'លេខកូដកំណត់ពាក្យសម្ងាត់ឡើងវិញ',
      resendButton: 'មិនទទួលបានលេខកូដទេ? ផ្ញើម្តងទៀត',
      subtitle: 'ដើម្បីកំណត់ពាក្យសម្ងាត់របស់អ្នកឡើងវិញ',
      subtitle_email: 'ដំបូង សូមបញ្ចូលលេខកូដដែលបានផ្ញើទៅអាសយដ្ឋានអ៊ីមែលរបស់អ្នក',
      subtitle_phone: 'ដំបូង សូមបញ្ចូលលេខកូដដែលបានផ្ញើទៅទូរស័ព្ទរបស់អ្នក',
      title: 'កំណត់ពាក្យសម្ងាត់ឡើងវិញ',
    },
    forgotPasswordAlternativeMethods: {
      blockButton__resetPassword: 'កំណត់ពាក្យសម្ងាត់របស់អ្នកឡើងវិញ',
      label__alternativeMethods: 'ឬ ចូលគណនីដោយវិធីផ្សេងទៀត',
      title: 'ភ្លេចពាក្យសម្ងាត់?',
    },
    alternativeMethods: {
      actionLink: 'ទទួលជំនួយ',
      actionText: 'មិនមានវិធីណាមួយទាំងនេះទេ?',
      blockButton__backupCode: 'ប្រើលេខកូដបម្រុង',
      blockButton__emailCode: 'ផ្ញើលេខកូដទៅអ៊ីមែល {{identifier}}',
      blockButton__emailLink: 'ផ្ញើតំណភ្ជាប់ទៅអ៊ីមែល {{identifier}}',
      blockButton__passkey: 'ចូលគណនីដោយប្រើ Passkey របស់អ្នក',
      blockButton__password: 'ចូលគណនីដោយប្រើពាក្យសម្ងាត់របស់អ្នក',
      blockButton__phoneCode: 'ផ្ញើលេខកូដ SMS ទៅ {{identifier}}',
      blockButton__totp: 'ប្រើកម្មវិធីផ្ទៀងផ្ទាត់របស់អ្នក',
      getHelp: {
        blockButton__emailSupport: 'ផ្ញើអ៊ីមែលទៅផ្នែកជំនួយ',
        content: 'ប្រសិនបើអ្នកជួបបញ្ហាក្នុងការចូលគណនីរបស់អ្នក សូមផ្ញើអ៊ីមែលមកយើងខ្ញុំ ហើយយើងនឹងធ្វើការជាមួយអ្នកដើម្បីស្តារការចូលប្រើឲ្យបានឆាប់តាមដែលអាចធ្វើទៅបាន។',
        title: 'ទទួលជំនួយ',
      },
      subtitle: 'ជួបបញ្ហា? អ្នកអាចប្រើវិធីណាមួយទាំងនេះដើម្បីចូលគណនី។',
      title: 'ប្រើវិធីផ្សេងទៀត',
    },
    resetPassword: {
      formButtonPrimary: 'កំណត់ពាក្យសម្ងាត់ឡើងវិញ',
      requiredMessage: 'ដោយសារហេតុផលសុវត្ថិភាព ចាំបាច់ត្រូវកំណត់ពាក្យសម្ងាត់របស់អ្នកឡើងវិញ។',
      successMessage: 'ពាក្យសម្ងាត់របស់អ្នកត្រូវបានផ្លាស់ប្តូរដោយជោគជ័យ។ កំពុងចូលគណនីអ្នក សូមរង់ចាំបន្តិច។',
      title: 'កំណត់ពាក្យសម្ងាត់ថ្មី',
    },
    noAvailableMethods: {
      message: 'មិនអាចបន្តការចូលគណនីបានទេ។ គ្មានវិធីផ្ទៀងផ្ទាត់ណាមួយអាចប្រើបានទេ។',
      subtitle: 'កំហុសមួយបានកើតឡើង',
      title: 'មិនអាចចូលគណនីបានទេ',
    },
    newDeviceVerificationNotice: 'អ្នកកំពុងចូលគណនីពីឧបករណ៍ថ្មី។ យើងស្នើសុំការផ្ទៀងផ្ទាត់ដើម្បីរក្សាសុវត្ថិភាពគណនីរបស់អ្នក។',
    passwordCompromised: { title: 'ពាក្យសម្ងាត់មិនមានសុវត្ថិភាព' },
    passwordPwned: { title: 'ពាក្យសម្ងាត់មិនមានសុវត្ថិភាព' },
    passwordUntrusted: { title: 'ពាក្យសម្ងាត់មិនគួរឲ្យទុកចិត្ត' },
  },
};
