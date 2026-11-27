/**
 * Curated, verified reference facts the assistant is allowed to quote.
 *
 * Rule: the model may only state amounts, eligibility rules, helplines and
 * websites that appear here. Anything else must be framed as "please check
 * with the official source" — never invented.
 *
 * Keep entries short and factual, and always attach an official source.
 */

export interface KnowledgeEntry {
  id: string
  category: 'banking' | 'utilities' | 'schemes' | 'appointments' | 'general'
  title: string
  facts: string[]
  sources: { name: string; url?: string; phone?: string }[]
}

export const KNOWLEDGE: KnowledgeEntry[] = [
  // ---------------- Banking safety & information ----------------
  {
    id: 'bank-safety',
    category: 'banking',
    title: 'Banking safety rules',
    facts: [
      'Banks, RBI and government officials never ask for OTP, UPI PIN, ATM PIN, CVV or passwords over phone, SMS or WhatsApp.',
      'You never need to enter a UPI PIN to RECEIVE money. A PIN is only needed to send money.',
      'If money is lost to online fraud, call the National Cyber Crime Helpline 1930 immediately and report at cybercrime.gov.in.',
      'To block a lost debit card, call your bank\'s official customer care number printed on the back of the card or on the bank\'s official website, or use the bank\'s official app.',
    ],
    sources: [
      { name: 'National Cyber Crime Reporting Portal', url: 'https://cybercrime.gov.in', phone: '1930' },
      { name: 'Reserve Bank of India', url: 'https://www.rbi.org.in' },
    ],
  },
  {
    id: 'bank-balance',
    category: 'banking',
    title: 'Checking bank balance',
    facts: [
      'Balance can be checked through the bank\'s official mobile app, net banking, an ATM, the passbook at the branch, or a UPI app.',
      'On any basic phone without internet, dial *99# (USSD service by NPCI) for basic banking such as balance enquiry, if your mobile number is linked to your bank account.',
      'Many banks offer a missed-call balance number; the number is different for each bank, so take it only from the bank\'s official website or passbook.',
      'Namma Voice cannot see your account or balance. It only guides you.',
    ],
    sources: [{ name: 'NPCI *99# service', url: 'https://www.npci.org.in' }],
  },
  {
    id: 'bank-complaint',
    category: 'banking',
    title: 'Bank complaints',
    facts: [
      'First complain to your bank branch or the bank\'s official customer care.',
      'If the bank does not resolve it within 30 days, or you are not satisfied, you can complain to the RBI Ombudsman at cms.rbi.org.in. RBI contact centre: 14448.',
    ],
    sources: [{ name: 'RBI Complaint Management System', url: 'https://cms.rbi.org.in', phone: '14448' }],
  },
  {
    id: 'pmjdy',
    category: 'banking',
    title: 'Pradhan Mantri Jan Dhan Yojana (PMJDY)',
    facts: [
      'A basic savings bank account can be opened with zero balance at any bank branch or Bank Mitra (business correspondent).',
      'Account holders get a RuPay debit card.',
      'Documents: Aadhaar or another officially valid document for KYC.',
    ],
    sources: [{ name: 'PMJDY', url: 'https://pmjdy.gov.in' }],
  },

  // ---------------- Electricity & utility bills ----------------
  {
    id: 'electricity-general',
    category: 'utilities',
    title: 'Paying or checking an electricity bill',
    facts: [
      'You need your consumer number / service connection number (printed on your old bill or meter card) and your electricity provider\'s name.',
      'You can check and pay through your electricity provider\'s official website or app, at the provider\'s cash counter, or through Bharat BillPay (BBPS) inside UPI apps and bank apps.',
      'Before paying, always check that the consumer name shown matches yours.',
      'Keep the payment reference number / receipt after paying. Namma Voice cannot make or confirm payments.',
      'For power cuts or complaints, many states use helpline 1912. Your provider\'s own number is printed on your bill.',
    ],
    sources: [{ name: 'Bharat BillPay (NPCI)', url: 'https://www.bharat-billpay.com' }],
  },
  {
    id: 'electricity-providers',
    category: 'utilities',
    title: 'Common electricity providers by state',
    facts: [
      'Tamil Nadu: TNPDCL (Tamil Nadu Power Distribution Corporation, earlier called TANGEDCO / TNEB).',
      'Karnataka: BESCOM (Bengaluru region), MESCOM, HESCOM, GESCOM, CESC Mysuru.',
      'Kerala: KSEB (Kerala State Electricity Board).',
      'Telangana: TGSPDCL (south) and TGNPDCL (north).',
      'Andhra Pradesh: APSPDCL, APEPDCL, APCPDCL.',
      'Maharashtra: MSEDCL (Mahavitaran); in parts of Mumbai: Adani Electricity, Tata Power, BEST.',
      'Delhi: BSES Rajdhani, BSES Yamuna, Tata Power-DDL.',
      'Uttar Pradesh: UPPCL distribution companies.',
    ],
    sources: [],
  },
  {
    id: 'lpg',
    category: 'utilities',
    title: 'LPG gas cylinder booking',
    facts: [
      'Book through your gas company\'s official app or website (Indane, Bharat Gas or HP Gas), by IVRS/SMS from your registered mobile, or through UPI apps.',
      'LPG emergency helpline (leaks): 1906.',
    ],
    sources: [{ name: 'LPG emergency', phone: '1906' }],
  },

  // ---------------- Government schemes ----------------
  {
    id: 'pm-kisan',
    category: 'schemes',
    title: 'PM-KISAN',
    facts: [
      'Income support of ₹6,000 per year to eligible landholding farmer families, paid in three instalments of ₹2,000 directly to the bank account.',
      'Some groups are excluded (for example income-tax payers, government employees, and certain professionals). Final eligibility is decided by the government, not by Namma Voice.',
      'e-KYC is mandatory. Status can be checked on pmkisan.gov.in under "Know Your Status".',
      'Helpline: 155261 or 011-24300606.',
    ],
    sources: [{ name: 'PM-KISAN', url: 'https://pmkisan.gov.in', phone: '155261' }],
  },
  {
    id: 'pmjay',
    category: 'schemes',
    title: 'Ayushman Bharat PM-JAY (health cover)',
    facts: [
      'Health cover of up to ₹5 lakh per family per year for hospital treatment at empanelled hospitals.',
      'Eligibility is based on government lists (SECC data and state lists). Since 2024, all senior citizens aged 70 and above are eligible irrespective of income (Ayushman Vay Vandana card).',
      'Check eligibility at beneficiary.nha.gov.in or the Ayushman app, or at an empanelled hospital\'s Ayushman Mitra desk.',
      'Helpline: 14555.',
    ],
    sources: [{ name: 'National Health Authority', url: 'https://beneficiary.nha.gov.in', phone: '14555' }],
  },
  {
    id: 'apy',
    category: 'schemes',
    title: 'Atal Pension Yojana (APY)',
    facts: [
      'For citizens aged 18 to 40 with a savings bank account.',
      'Gives a guaranteed monthly pension of ₹1,000 to ₹5,000 after age 60, depending on the amount contributed.',
      'From 1 October 2022, income-tax payers cannot join.',
      'Join through your bank branch or bank app.',
    ],
    sources: [{ name: 'PFRDA – APY', url: 'https://www.pfrda.org.in' }],
  },
  {
    id: 'pmsby-pmjjby',
    category: 'schemes',
    title: 'PMSBY and PMJJBY (insurance through bank)',
    facts: [
      'PMSBY: accident insurance of ₹2 lakh for ages 18–70, premium ₹20 per year, auto-debited from the bank account.',
      'PMJJBY: life insurance of ₹2 lakh for ages 18–50, premium ₹436 per year, auto-debited from the bank account.',
      'Enrol at your bank branch or through the bank\'s app.',
    ],
    sources: [{ name: 'Jan Suraksha portal', url: 'https://jansuraksha.gov.in' }],
  },
  {
    id: 'ujjwala',
    category: 'schemes',
    title: 'PM Ujjwala Yojana (LPG connection)',
    facts: [
      'Provides LPG connections to adult women from poor households.',
      'Apply at the nearest LPG distributor or online at pmuy.gov.in.',
    ],
    sources: [{ name: 'PMUY', url: 'https://www.pmuy.gov.in' }],
  },
  {
    id: 'old-age-pension',
    category: 'schemes',
    title: 'Old age, widow and disability pension',
    facts: [
      'Under the National Social Assistance Programme (NSAP), the central government supports old age, widow and disability pensions. States add their own amount, so the final monthly amount differs by state.',
      'Apply through your village panchayat, municipal office, taluk / tehsil office, or your state\'s e-Sevai / Mee Seva / common service centre (CSC).',
      'Namma Voice cannot confirm your exact pension amount; please check with your state social welfare department.',
    ],
    sources: [{ name: 'NSAP', url: 'https://nsap.nic.in' }],
  },
  {
    id: 'ration',
    category: 'schemes',
    title: 'Ration card (PDS)',
    facts: [
      'Under One Nation One Ration Card, eligible ration card holders can take their ration from any ration shop in India using Aadhaar authentication.',
      'Ration card applications and changes are handled by your state food & civil supplies department portal or office.',
      'The Mera Ration app shows nearby ration shops and entitlements.',
    ],
    sources: [{ name: 'Department of Food & Public Distribution', url: 'https://nfsa.gov.in' }],
  },

  // ---------------- Appointments & documents ----------------
  {
    id: 'aadhaar',
    category: 'appointments',
    title: 'Aadhaar update / enrolment appointment',
    facts: [
      'Book an appointment at an Aadhaar Seva Kendra through the official UIDAI website (myaadhaar.uidai.gov.in) or visit an Aadhaar enrolment centre at banks and post offices.',
      'UIDAI helpline: 1947.',
      'Always carry original documents for proof of identity and address.',
    ],
    sources: [{ name: 'UIDAI', url: 'https://uidai.gov.in', phone: '1947' }],
  },
  {
    id: 'passport',
    category: 'appointments',
    title: 'Passport appointment',
    facts: [
      'Register and book an appointment at passportindia.gov.in or the mPassport Seva app; pay fees online and choose a Passport Seva Kendra or Post Office PSK.',
      'Passport Seva helpline: 1800-258-1800.',
      'Use only the official website — beware of agent websites charging extra.',
    ],
    sources: [{ name: 'Passport Seva', url: 'https://www.passportindia.gov.in', phone: '1800-258-1800' }],
  },
  {
    id: 'doctor',
    category: 'appointments',
    title: 'Doctor / hospital appointment',
    facts: [
      'eSanjeevani is the government\'s free online doctor consultation service (esanjeevani.mohfw.gov.in).',
      'An ABHA (Ayushman Bharat Health Account) number lets many government hospitals give scan-and-share OPD registration.',
      'For medical emergencies, call 108 (ambulance) or 112 (all emergencies).',
    ],
    sources: [
      { name: 'eSanjeevani', url: 'https://esanjeevani.mohfw.gov.in' },
      { name: 'ABHA', url: 'https://abha.abdm.gov.in' },
    ],
  },
  {
    id: 'digilocker',
    category: 'appointments',
    title: 'DigiLocker documents',
    facts: [
      'DigiLocker (digilocker.gov.in) stores official digital copies of documents like Aadhaar, driving licence and marksheets, which are legally valid.',
    ],
    sources: [{ name: 'DigiLocker', url: 'https://www.digilocker.gov.in' }],
  },

  // ---------------- General ----------------
  {
    id: 'emergency',
    category: 'general',
    title: 'Emergency numbers',
    facts: [
      '112: all emergencies. 100: police. 101: fire. 108: ambulance (most states). 1098: child helpline. 181: women helpline (most states). 14567: Elder Line for senior citizens.',
    ],
    sources: [],
  },
]

export function knowledgeAsPrompt(): string {
  return KNOWLEDGE.map(
    (k) =>
      `### [${k.id}] ${k.title} (${k.category})\n` +
      k.facts.map((f) => `- ${f}`).join('\n') +
      (k.sources.length
        ? `\nSources: ${k.sources
            .map((s) => [s.name, s.url, s.phone && `ph ${s.phone}`].filter(Boolean).join(' · '))
            .join(' | ')}`
        : ''),
  ).join('\n\n')
}

export function sourcesFor(ids: string[]) {
  const seen = new Set<string>()
  const out: { name: string; url?: string; phone?: string }[] = []
  for (const id of ids) {
    const entry = KNOWLEDGE.find((k) => k.id === id)
    if (!entry) continue
    for (const s of entry.sources) {
      if (seen.has(s.name)) continue
      seen.add(s.name)
      out.push(s)
    }
  }
  return out
}
