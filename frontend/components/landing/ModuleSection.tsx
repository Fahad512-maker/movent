// 'use client';

// const MODULES = [
//   'Leads', 'Clients', 'Invoices', 'Payments', 'Projects',
//   'Tasks', 'Timesheets', 'Production Queue', 'Deliverables',
//   'HR', 'Attendance', 'Leave', 'Payroll', 'Documents',
//   'Compliance', 'Chat', 'Notifications', 'Reports',
// ];

// const COLORS = [
//   { bg: '#eff6ff', color: '#2563eb' },
//   { bg: '#ecfdf5', color: '#059669' },
//   { bg: '#fdf4ff', color: '#7c3aed' },
//   { bg: '#fff7ed', color: '#ea580c' },
//   { bg: '#f0fdf4', color: '#16a34a' },
//   { bg: '#fef2f2', color: '#dc2626' },
// ];

// export default function ModuleSection() {
//   return (
//     <section id="modules" style={{ padding: '96px 0', background: '#f8fafc' }}>
//       <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
//         <div style={{ display: 'inline-block', padding: '5px 14px', background: '#ecfdf5', borderRadius: 50, fontSize: 12, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
//           Modular
//         </div>
//         <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 42px)', fontWeight: 800, color: '#0f172a', margin: '0 0 14px', letterSpacing: '-0.5px' }}>
//           Pick Only What You Need
//         </h2>
//         <p style={{ fontSize: 17, color: '#64748b', marginBottom: 44 }}>
//           Modular pricing — pay for what you use
//         </p>

//         <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 40 }}>
//           {MODULES.map((mod, i) => {
//             const { bg, color } = COLORS[i % COLORS.length];
//             return (
//               <span key={mod} style={{
//                 padding: '8px 18px',
//                 background: bg,
//                 color: color,
//                 borderRadius: 50,
//                 fontSize: 14,
//                 fontWeight: 600,
//                 border: `1px solid ${color}22`,
//               }}>
//                 {mod}
//               </span>
//             );
//           })}
//         </div>

//         <p style={{ fontSize: 15, color: '#94a3b8' }}>
//           Mix and match modules to build your perfect plan{' '}
//           <a href="/register" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>→</a>
//         </p>
//       </div>
//     </section>
//   );
// }


'use client';

import Link from 'next/link';
import { IconType } from 'react-icons';
import {
  FaHeart,
  FaUsers,
  FaFileInvoice,
  FaMoneyBillWave,
  FaProjectDiagram,
  FaTasks,
  FaClock,
  FaUserTie,
  FaCalendarCheck,
  FaUmbrellaBeach,
  FaMoneyCheckAlt,
  FaFileAlt,
  FaShieldAlt,
  FaComments,
  FaBell,
  FaChartBar,
  FaArrowRight,
  FaIndustry,
} from 'react-icons/fa';
import { MdFactory } from 'react-icons/md';

import ServicesBg from '../../public/ServicesBg.png';

interface ModuleItem {
  name: string;
  icon: IconType;
  iconColor: string;
  textColor: string;
  borderColor: string;
  bg: string;
}

const MODULES: ModuleItem[] = [
  {
    name: 'Leads',
    icon: FaHeart,
    iconColor: '#da457c',
    textColor: '#676769',
    borderColor: '#e8ecee',
    bg: '#fef9fe',
  },
  {
    name: 'Clients',
    icon: FaUsers,
    iconColor: '#f4aa58',
    textColor: '#676769',
    borderColor: '#e8ecee',
    bg: '#fff9f7',
  },
  {
    name: 'Invoices',
    icon: FaFileInvoice,
    iconColor: '#f0e465',
    textColor: '#676769',
    borderColor: '#e8ecee',
    bg: '#fafcfc',
  },
  {
    name: 'Payments',
    icon: FaMoneyBillWave,
    iconColor: '#df4578',
    textColor: '#676769',
    borderColor: '#e8ecee',
    bg: '#fef5fa',
  },
  {
    name: 'Projects',
    icon: FaProjectDiagram,
    iconColor: '#5ac89d',
    textColor: '#676769',
    borderColor: '#e8ecee',
    bg: '#f9f9f9',
  },
  {
    name: 'Tasks',
    icon: FaTasks,
    iconColor: '#dd3b6f',
    textColor: '#676769',
    borderColor: '#e8ecee',
    bg: '#fefbff',
  },
  {
    name: 'Timeheets',
    icon: FaClock,
    iconColor: '#7699ce',
    textColor: '#676769',
    borderColor: '#e8ecee',
    bg: '#fdfcff',
  },
  {
    name: 'Production Quuee',
    icon: FaIndustry,
    iconColor: '#b1c089',
    textColor: '#676769',
    borderColor: '#ecf6f4',
    bg: '#f7fefc',
  },
  {
    name: 'Delivarbles',
    icon: MdFactory,
    iconColor: '#948fba',
    textColor: '#676769',
    borderColor: '#ebe9f0',
    bg: '#fffdff',
  },
  {
    name: 'HR',
    icon: FaUserTie,
    iconColor: '#dd3b6f',
    textColor: '#676769',
    borderColor: '#e8ecee',
    bg: '#fefbff',
  },
  {
    name: 'Attendence',
    icon: FaCalendarCheck,
    iconColor: '#cdce7d',
    textColor: '#676769',
    borderColor: '#edf1f2',
    bg: '#f8ffff',
  },
  {
    name: 'Leaves',
    icon: FaUmbrellaBeach,
    iconColor: '#a788c4',
    textColor: '#676769',
    borderColor: '#edf1f2',
    bg: '#f6fdf9',
  },
  {
    name: 'Payroll',
    icon: FaMoneyCheckAlt,
    iconColor: '#aa79c6',
    textColor: '#676769',
    borderColor: '#e8eaec',
    bg: '#f7fafd',
  },
  {
    name: 'Documents',
    icon: FaFileAlt,
    iconColor: '#83c0c9',
    textColor: '#676769',
    borderColor: '#eceef5',
    bg: '#f4fcf5',
  },
  {
    name: 'Compilance',
    icon: FaShieldAlt,
    iconColor: '#a173ce',
    textColor: '#676769',
    borderColor: '#f0ecf3',
    bg: '#f6f8f9',
  },
  {
    name: 'Chat',
    icon: FaComments,
    iconColor: '#d27b85',
    textColor: '#676769',
    borderColor: '#f4e8f1',
    bg: '#fdfffd',
  },
  {
    name: 'Notifications',
    icon: FaBell,
    iconColor: '#e053de',
    textColor: '#676769',
    borderColor: '#f4f1f4',
    bg: '#fefdfd',
  },
  {
    name: 'Reports',
    icon: FaChartBar,
    iconColor: '#a886d1',
    textColor: '#676769',
    borderColor: '#f4f1f4',
    bg: '#fbfbfd',
  },
];

export default function ModuleSection() {
  return (
    <section id="modules" className="module-part-home-page">
      <div className="modular-scd-div flex items-center flex-col gap-5">
        <div className="flex items-center flex-col justify-center gap-2 w-full">
          <div className="modules_bnt">Modules</div>

          <h2 className="features-h2-text">
            Pick Only What You Need
          </h2>

          <p className="fw-semibold features-text-no-2 m-0">
            Modular pricing — pay for what you use
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            width: '100%',
            gap: 10,
            justifyContent: 'center',
          }}
        >
          {MODULES.map((mod, index) => {
            const Icon = mod.icon;

            return (
              <span
                key={`${mod.name}-${index}`}
                className="d-flex align-items-center gap-2"
                style={{
                  padding: '8px 18px',
                  background: mod.bg,
                  color: mod.textColor,
                  borderRadius: 50,
                  fontSize: 14,
                  fontWeight: 600,
                  border: `1px solid ${mod.borderColor}`,
                }}
              >
                <Icon
                  size={16}
                  style={{
                    color: mod.iconColor,
                  }}
                />

                {mod.name}
              </span>
            );
          })}
        </div>

        <Link href="/register">
          <p className="fw-semibold flex items-center gap-1 features-text-no-2">
            Mix and match modules to build your perfect plan
            <FaArrowRight
              size={15}
              strokeWidth={10}
              className="pt-0.5"
            />
          </p>
        </Link>
      </div>
    </section>
  );
}