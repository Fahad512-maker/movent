'use client';

import Link from 'next/link';
import { FaArrowRight } from 'react-icons/fa';
import { FiCheck } from 'react-icons/fi';
import { PublicPackage } from '@/types';

const MODULE_LABELS: Record<string, string> = {
    attendance: 'Attendance Tracking',
    chat: 'Chat & Announcements',
    client_portal: 'Client Portal',
    clients: 'Client Management',
    compliance: 'Compliance',
    documents: 'Documents',
    hr: 'HR Management',
    invoices: 'Invoices',
    leads: 'Leads',
    leaves: 'Leave Management',
    payments: 'Payments',
    payroll: 'Payroll',
    production: 'Production',
    projects: 'Project Management',
    recruitment: 'Recruitment',
    reports: 'Reports & Analytics',
    tasks: 'Task Management',
    timesheets: 'Timesheets',
};

interface PricingCardProps {
    pkg: PublicPackage;
}

export default function PricingCard({
    pkg,
}: PricingCardProps) {
    const price = Number(pkg.price_usd);

    const isFree = price === 0;

    return (
        <div
            style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '28px',
                padding: '40px 32px 32px',
                position: 'relative',
                boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.04)',
                color: '#0f172a',
                height: '550px',
                display: "flex",
                width: "100%",
                flexDirection: "column",
                transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)',
            }}
        >
            {pkg.is_popular && (
                <div
                    style={{
                        position: 'absolute',
                        top: -13,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'var(--brand-gradient)',
                        color: 'white',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '6px 20px',
                        borderRadius: '9999px',
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.08em',
                        boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                        border: '1px solid rgba(255,255,255,0.3)',
                    }}
                >
                    MOST POPULAR
                </div>
            )}

            <div style={{ marginBottom: 8 }}>
                <div
                    style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        letterSpacing: '0.1em',
                        color: '#64748b',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                    }}
                >
                    {pkg.tier || 'Plan'}
                </div>

                <div
                    style={{
                        fontSize: '26px',
                        fontWeight: 800,
                        letterSpacing: '-0.02em',
                        color: 'var(--text-heading)',
                    }}
                >
                    {pkg.name}
                </div>
            </div>

            <div
                style={{
                    height: '1px',
                    background: 'linear-gradient(to right, transparent, #e2e8f0, transparent)',
                    margin: '4px 0',
                }}
            />

            <div>
                {isFree ? (
                    <div>
                        <span
                            style={{
                                fontSize: '48px',
                                fontWeight: 800,
                                letterSpacing: '-0.04em',
                                color: '#0f172a',
                            }}
                        >
                            Free
                        </span>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                        <span
                            style={{
                                fontSize: '18px',
                                fontWeight: 600,
                                color: 'var(--text-muted)',
                                alignSelf: 'flex-end',
                                marginBottom: '6px',
                            }}
                        >
                            USD
                        </span>
                        <span
                            style={{
                                fontSize: '48px',
                                fontWeight: 800,
                                letterSpacing: '-0.04em',
                                color: 'var(--text-heading)',
                            }}
                        >
                            ${pkg.price_usd}
                        </span>
                        <span
                            style={{
                                fontSize: '15px',
                                color: 'var(--text-muted)',
                                marginLeft: '4px',
                                alignSelf: 'flex-end',
                                marginBottom: '8px',
                            }}
                        >
                            /month
                        </span>
                    </div>
                )}
            </div>

            {pkg.trial_days > 0 && (
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#22c55e',
                        fontSize: '14px',
                        fontWeight: 600,
                        marginBottom: '28px',
                        background: 'rgba(74, 222, 128, 0.1)',
                        padding: '4px 14px',
                        borderRadius: '9999px',
                    }}
                >
                    <div style={{ width: 6, height: 6, background: '#22c55e', borderRadius: '50%' }} />
                    {pkg.trial_days}-day free trial
                </div>
            )}

            <div className="ScrollBar" style={{
                flex: 1,
                overflowY: 'auto',
                maxHeight: "300px",
                display: 'flex', flexDirection: 'column'
            }}>
                <div style={{ marginBottom: 28 }}>
                    <div
                        style={{
                            fontSize: '13px',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            color: '#64748b',
                            textTransform: 'uppercase',
                            marginBottom: 16,
                        }}
                    >
                        WHAT'S INCLUDED
                    </div>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '14px 12px',
                        }}
                    >
                        {pkg.modules.map((module) => (
                            <div
                                key={module}
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 10,
                                }}
                            >
                                <span
                                    style={{
                                        width: 22,
                                        height: 22,
                                        flexShrink: 0,
                                        background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginTop: '1px',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                    }}
                                >
                                    <FiCheck
                                        size={13}
                                        color="#3b82f6"
                                        strokeWidth={3.5}
                                    />
                                </span>

                                <span
                                    style={{
                                        fontSize: '13.5px',
                                        color: '#334155',
                                        fontWeight: 500,
                                        lineHeight: 1.4,
                                    }}
                                >
                                    {MODULE_LABELS[module] || module}
                                </span>


                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <Link
                href={`/register?package=${pkg.id}`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '16px 24px',
                    borderRadius: '14px',
                    background: 'var(--brand-gradient)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '15px',
                    textDecoration: 'none',
                    boxShadow: '0 8px 25px -6px rgba(79, 70, 229, 0.4)',
                    marginTop: '20px',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                Start Free Trial
                <FaArrowRight size={17} />
            </Link>
        </div>
    );
}
