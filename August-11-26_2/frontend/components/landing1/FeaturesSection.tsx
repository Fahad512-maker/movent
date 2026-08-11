// 'use client';

// const FEATURES = [
//   { icon: '🎯', title: 'Sales Pipeline', desc: 'Track leads, convert clients, manage invoices and payments in one place.' },
//   { icon: '📁', title: 'Project Management', desc: 'Manage projects, tasks, timesheets and deliverables with ease.' },
//   { icon: '👔', title: 'Human Resources', desc: 'Employee management, attendance tracking, and payroll processing.' },
//   { icon: '🛡️', title: 'Compliance Portal', desc: 'Policies, risk assessment, incident tracking and full audit trails.' },
//   { icon: '📄', title: 'Document Management', desc: 'Centralized file storage with folder structure and access control.' },
//   { icon: '💬', title: 'Team Communication', desc: 'Real-time chat, notifications and seamless team collaboration.' },
// ];

// export default function FeaturesSection() {
//   return (
//     <section id="features" style={{ padding: '96px 0', background: '#fff' }}>
//       <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
//         <div style={{ textAlign: 'center', marginBottom: 56 }}>
//           <div style={{ display: 'inline-block', padding: '5px 14px', background: '#eff6ff', borderRadius: 50, fontSize: 12, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
//             Features
//           </div>
//           <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 42px)', fontWeight: 800, color: '#0f172a', margin: '0 0 14px', letterSpacing: '-0.5px' }}>
//             Everything You Need to Run Your Business
//           </h2>
//           <p style={{ fontSize: 17, color: '#64748b', margin: 0 }}>One platform for all your business operations</p>
//         </div>

//         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 22 }}>
//           {FEATURES.map(({ icon, title, desc }) => (
//             <div key={title}
//               style={{
//                 padding: '28px 30px',
//                 background: '#fff',
//                 border: '1.5px solid #e2e8f0',
//                 borderRadius: 14,
//                 transition: 'all 0.2s',
//                 cursor: 'default',
//               }}
//               onMouseEnter={e => {
//                 (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
//                 (e.currentTarget as HTMLDivElement).style.borderColor = '#bfdbfe';
//                 (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(37,99,235,0.1)';
//               }}
//               onMouseLeave={e => {
//                 (e.currentTarget as HTMLDivElement).style.transform = 'none';
//                 (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0';
//                 (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
//               }}>
//               <div style={{ fontSize: 36, marginBottom: 14 }}>{icon}</div>
//               <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>{title}</h3>
//               <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65, margin: 0 }}>{desc}</p>
//             </div>
//           ))}
//         </div>
//       </div>
//     </section>
//   );
// }


'use client';

import { ReactElement } from 'react';
import Container from '../../components/ui/Conatiner';
import { TbTargetArrow } from 'react-icons/tb';
import { FaFolderOpen } from 'react-icons/fa';
import { BsFileEarmarkTextFill } from 'react-icons/bs';
import { LuShieldPlus } from 'react-icons/lu';
import { RiTodoLine } from 'react-icons/ri';
import { BiMessageDots } from 'react-icons/bi';

interface FeatureItem {
  icon: ReactElement;
  title: string;
  desc: string;
}

const FEATURES: FeatureItem[] = [
  {
    icon: <TbTargetArrow size={26} color="white" />,
    title: 'Sales Pipeline',
    desc: 'Track leads, convert clients, manage invoices and payments in one place.',
  },
  {
    icon: <FaFolderOpen size={26} color="white" />,
    title: 'Project Management',
    desc: 'Manage projects, tasks, timesheets and deliverables with ease.',
  },
  {
    icon: <RiTodoLine size={26} color="white" />,
    title: 'Human Resources',
    desc: 'Employee management, attendance tracking, and payroll processing.',
  },
  {
    icon: <LuShieldPlus size={26} color="white" />,
    title: 'Compliance Portal',
    desc: 'Policies, risk assessment, incident tracking and full audit trails.',
  },
  {
    icon: <BsFileEarmarkTextFill size={26} color="white" />,
    title: 'Document Management',
    desc: 'Centralized file storage with folder structure and access control.',
  },
  {
    icon: <BiMessageDots size={26} color="white" />,
    title: 'Team Communication',
    desc: 'Real-time chat, notifications and seamless team collaboration.',
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="my-16 features-part-home-page">
      <Container>
        <div
          className="flex items-center flex-col justify-center gap-10"
          style={{ maxWidth: 1200, margin: '0 auto', padding: '0px' }}
        >
          <div className="flex items-center flex-col justify-center gap-2">
            <div className="features_bnt">
              Features
            </div>

            <h2 className="features-h2-text text-center">
              Everything You Need to Run Your Business
            </h2>

            <p className="fw-semibold features-text-no-2 text-center m-0">
              One platform for all your business operations
            </p>
          </div>

          <div className="grid lg:grid-cols-3 sm:grid-cols-2 items-start gap-4 w-full">
            {FEATURES.map(({ icon, title, desc }) => (
              <div
                key={title}
                className="d-flex align-items-start shadow-sm rounded-2 featured-boxes gap-3"
              >
                <div
                  className={`d-flex align-items-center justify-content-center rounded-4 featured-box-icon ${title === 'Document Management'
                      ? 'blueueu'
                      : title === 'Project Management'
                        ? 'ywlwlw'
                        : title === 'Human Resources'
                          ? 'grenenn'
                          : title === 'Compliance Portal'
                            ? 'purprple'
                            : 'rediididii'
                    }`}
                  style={{ fontSize: 36 }}
                >
                  {icon}
                </div>

                <div>
                  <h3 className="featured-boxes-h3">{title}</h3>

                  <p className="featured-boxes-paragraph line-clamp-3">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}