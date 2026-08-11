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
                background: 'var(--bg-white)',
                border: '1.5px solid var(--border-light)',
                borderRadius: 20,
                padding: '36px 28px 28px',
                position: 'relative',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                color: 'var(--text-heading)',
            }}
        >
            {pkg.is_popular && (
                <div
                    style={{
                        position: 'absolute',
                        top: -14,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'var(--brand-gradient)',
                        color: 'var(--bg-white)',
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '5px 16px',
                        borderRadius: 50,
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.05em',
                        boxShadow: '0 2px 10px rgba(251,191,36,0.4)',
                    }}
                >
                    MOST POPULAR
                </div>
            )}

            <div style={{ marginBottom: 6 }}>
                <div
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        color: pkg.is_popular
                            ? 'rgba(255,255,255,0.6)'
                            : '#94a3b8',
                        textTransform: 'uppercase',
                    }}
                >
                    {pkg.tier || 'Plan'}
                </div>

                <div
                    style={{
                        fontSize: 22,
                        fontWeight: 900,
                        color: 'var(--text-heading)',
                    }}
                >
                    {pkg.name}
                </div>
            </div>

            <div
                style={{
                    height: 1,
                    background: pkg.is_popular
                        ? 'rgba(255,255,255,0.15)'
                        : '#f1f5f9',
                }}
            />

            <div style={{ marginBottom: 8 }}>
                {isFree ? (
                    <div>
                        <span
                            style={{
                                fontSize: 38,
                                fontWeight: 900,
                                color: 'var(--text-heading)',
                            }}
                        >
                            Free
                        </span>

                        <span
                            style={{
                                fontSize: 13,
                                color: 'var(--text-muted)',
                                marginLeft: 6,
                            }}
                        >
                            to start
                        </span>
                    </div>
                ) : (
                    <div>
                        <span
                            style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: pkg.is_popular
                                    ? 'rgba(255,255,255,0.7)'
                                    : '#64748b',
                            }}
                        >
                            USD
                        </span>

                        <span
                            style={{
                                fontSize: 38,
                                fontWeight: 900,
                                color: 'var(--text-heading)',
                                margin: '0 3px',
                            }}
                        >
                            ${pkg.price_usd}
                        </span>

                        <span
                            style={{
                                fontSize: 13,
                                color: pkg.is_popular
                                    ? 'rgba(255,255,255,0.6)'
                                    : '#94a3b8',
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
                        gap: 5,
                        background: pkg.is_popular
                            ? 'rgba(255,255,255,0.15)'
                            : '#f0fdf4',
                        color: '#16a34a',
                        fontSize: 15,
                        fontWeight: 600,
                        marginBottom: 20,
                        border: pkg.is_popular
                            ? '1px solid rgba(255,255,255,0.2)'
                            : '1px solid #bbf7d0',
                    }}
                >
                    {pkg.trial_days}-day free trial
                </div>
            )}

            <div style={{ marginBottom: 26 }}>
                <div
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        marginBottom: 12,
                    }}
                >
                    What's included
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px 6px',
                    }}
                >
                    {pkg.modules.map((module) => (
                        <div
                            key={module}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 7,
                            }}
                        >
                            <span
                                style={{
                                    width: 18,
                                    height: 18,
                                    flexShrink: 0,
                                    background: pkg.is_popular
                                        ? 'rgba(255,255,255,0.2)'
                                        : '#eff6ff',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <FiCheck
                                    size={10}
                                    color="var(--brand-blue)"
                                    strokeWidth={3}
                                />
                            </span>

                            <span
                                style={{
                                    fontSize: 12.5,
                                    color: '#475569',
                                    fontWeight: 500,
                                    lineHeight: 1.3,
                                }}
                            >
                                {MODULE_LABELS[module] || module}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <Link
                href={`/register?package=${pkg.id}`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '13px',
                    borderRadius: 10,
                    background: 'var(--brand-gradient)',
                    color: 'var(--bg-white)',
                    fontWeight: 700,
                    fontSize: 14,
                    textDecoration: 'none',
                    boxShadow: pkg.is_popular
                        ? '0 4px 16px rgba(0,0,0,0.15)'
                        : '0 4px 14px rgba(37,99,235,0.3)',
                    letterSpacing: '0.02em',
                }}
            >
                Start Free Trial
                <FaArrowRight size={16} />
            </Link>
        </div>
    );
}
