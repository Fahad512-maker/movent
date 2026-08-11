'use client';

import React, { ReactElement } from 'react';
import Container from '../../components/ui/Conatiner';
import { TbTargetArrow } from 'react-icons/tb';
import { FaFolderOpen } from 'react-icons/fa';
import { RiTodoLine } from 'react-icons/ri';

import "@/styles/index.css"

interface FeatureItem {
  step: number;
  icon: ReactElement;
  color: string;
  backgroundColor: string;
  title: string;
  desc: string;
}

const FEATURES: FeatureItem[] = [
  {
    step: 1,
    icon: <TbTargetArrow size={40} color="var(--brand-blue)" />,
    color: 'var(--brand-blue)',
    backgroundColor: 'var(--bg-soft-blue)',
    title: 'Choose Your Plan',
    desc: 'Track leads, convert clients, manage invoices and payments in one place.',
  },
  {
    step: 2,
    icon: <FaFolderOpen size={40} color="var(--icon-indigo)" />,
    color: 'var(--icon-indigo)',
    backgroundColor: 'var(--bg-purple)',
    title: 'Setup Your Company',
    desc: 'Manage projects, tasks, timesheets and deliverables with ease.',
  },
  {
    step: 3,
    icon: <RiTodoLine size={40} color="var(--icon-green)" />,
    color: 'var(--icon-green)',
    backgroundColor: 'var(--bg-green)',
    title: 'Start Working',
    desc: 'Employee management, attendance tracking, and payroll processing.',
  },
];

export default function FeaturesSection() {
  return (
    <section
      id="howitwork"
      className="features-part-home-page"
      style={{
        background: 'var(--bg-backgound)',
        padding: '60px 0px',
      }}
    >
      <Container>
        <div className="w-full items-center flex-col justify-center h-auto">
          <div className="flex items-center gap-2 flex-col justify-center">
            <div className="features_bnt">
              HOW IT WORKS
            </div>

            <h2 className="features-h2-text text-center">
              Get Started in 3 Simple Steps
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 items-center justify-center w-full Steps gap-4">
            {FEATURES.map(
              (
                { step, icon, title, desc, color, backgroundColor },
                index
              ) => (
                <React.Fragment key={step}>
                  <div className="position-relative d-flex align-items-start shadow-sm rounded-2xl how-it-works-box gap-3">
                    <div>
                      <div
                        className={`d-flex align-items-center justify-content-center rounded-4 featured-box-icon ${title === 'Choose Your Plan'
                          ? 'auirnafnaf'
                          : title === 'Setup Your Company'
                            ? 'a9iutnva'
                            : 'iqafiaopf'
                          }`}
                      >
                        {icon}
                      </div>
                    </div>

                    <span
                      style={{
                        backgroundColor,
                        color,
                        border: `2px solid ${color}`,
                      }}
                      className="step-badge"
                    >
                      {step}
                    </span>

                    <div>
                      <h3 className="featured-boxes-h3">
                        {title}
                      </h3>

                      <p className="featured-boxes-paragraph">
                        {desc}
                      </p>
                    </div>
                  </div>
                </React.Fragment>
              )
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}