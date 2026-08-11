// // 'use client';

// // const TESTIMONIALS = [
// //   { quote: 'This CRM transformed how we manage clients. The leads pipeline alone saved us 10 hours a week.', name: 'Ahmed K.', role: 'CEO, TechCo' },
// //   { quote: 'Best investment for our growing team. The project management module is incredibly intuitive.', name: 'Sara M.', role: 'Operations, GrowthLab' },
// //   { quote: 'The compliance module saved us so much time during our audit. Highly recommended.', name: 'Ali R.', role: 'Manager, FinanceGroup' },
// // ];

// // export default function TestimonialsSection() {
// //   return (
// //     <section style={{ padding: '96px 0', background: '#f8fafc' }}>
// //       <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
// //         <div style={{ textAlign: 'center', marginBottom: 52 }}>
// //           <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 42px)', fontWeight: 800, color: '#0f172a', margin: '0 0 12px', letterSpacing: '-0.5px' }}>
// //             Trusted by Growing Businesses
// //           </h2>
// //           <p style={{ fontSize: 16, color: '#64748b' }}>See what our customers say</p>
// //         </div>

// //         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22 }}>
// //           {TESTIMONIALS.map(({ quote, name, role }) => (
// //             <div key={name} style={{
// //               background: '#fff',
// //               border: '1.5px solid #e2e8f0',
// //               borderRadius: 16,
// //               padding: '28px 30px',
// //               boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
// //             }}>
// //               <div style={{ fontSize: 28, color: '#2563eb', marginBottom: 16, lineHeight: 1 }}>"</div>
// //               <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.7, margin: '0 0 22px', fontStyle: 'italic' }}>{quote}</p>
// //               <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
// //                 <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
// //                   {name[0]}
// //                 </div>
// //                 <div>
// //                   <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{name}</div>
// //                   <div style={{ fontSize: 12, color: '#94a3b8' }}>{role}</div>
// //                 </div>
// //               </div>
// //             </div>
// //           ))}
// //         </div>
// //       </div>
// //     </section>
// //   );
// // }


// "use client";
// import Image from "next/image";
// import Container from "../../components/ui/Conatiner";
// import img_1 from "./../../public/360_F_383258331_D8imaEMl8Q3lf7EKU2Pi78Cn0R7KkW9o.jpg";
// import { RiDoubleQuotesL } from "react-icons/ri";
// import { Swiper, SwiperSlide } from "swiper/react";
// import { Pagination, Autoplay } from "swiper/modules";

// import "swiper/css";
// import "swiper/css/pagination";
// import { useRef } from "react";
// const TESTIMONIALS = [
//   {
//     quote:
//       "Movent transformed how we manage clients. The leads pipeline alone saved us 10 hours a week.",
//     name: "Ahmed R.",
//     role: "CEO, TechCo",
//     img: img_1,
//   },
//   {
//     quote:
//       "Best investment for our growing team. The project management module is incredibly intuitive.",
//     name: "Sara M.",
//     role: "Operations Manager, GrowthLab",
//     img: img_1,
//   },
//   {
//     quote:
//       "The compliance module saved us so much time during our audits. Highly recommended.",
//     name: "Ali K.",
//     role: "Finance Manager, FinanceGroup",
//     img: img_1,
//   },
//   {
//     quote:
//       "We replaced three different tools with Movent. Everything is now centralized and easier to manage.",
//     name: "Hassan A.",
//     role: "Founder, StartupHub",
//     img: img_1,
//   },
//   {
//     quote:
//       "Invoice tracking and payment management have never been this simple. Our workflow is much faster now.",
//     name: "Fatima Z.",
//     role: "Accounts Head, VisionCorp",
//     img: img_1,
//   },
//   {
//     quote:
//       "The HR and attendance modules helped us automate repetitive tasks and improve team productivity.",
//     name: "Usman T.",
//     role: "HR Manager, Nexa Solutions",
//     img: img_1,
//   },
//   {
//     quote:
//       "Setup was quick and easy. Within a day our entire team was onboarded and actively using the platform.",
//     name: "Ayesha N.",
//     role: "Operations Lead, BrightWorks",
//     img: img_1,
//   },
//   {
//     quote:
//       "The reporting dashboards provide clear insights into our business performance and growth metrics.",
//     name: "Bilal H.",
//     role: "Director, ScaleUp Inc.",
//     img: img_1,
//   },
//   {
//     quote:
//       "Customer support is exceptional. The team helped us customize workflows exactly according to our needs.",
//     name: "Zain M.",
//     role: "Managing Director, AlphaTech",
//     img: img_1,
//   },
//   {
//     quote:
//       "Movent gave us complete visibility over projects, invoices, and team performance in one place.",
//     name: "Mariam S.",
//     role: "Project Manager, InnovateX",
//     img: img_1,
//   },
// ];


// // const ReviewCard = ({ quote, name, role, img }) => {
// //   return <div
// //     className="testimonials-boxes d-flex flex-column justify-content-between border border-[var(--border-light)] shadow-sm rounded-md"
// //     style={{
// //       background: "var(--bg-white)",
// //       padding: "15px 15px",
// //       height: "200px",
// //     }
// //     }
// //   >
// //     <div className="flex items-start w-full gap-1 flex-col">
// //       <div
// //         style={{
// //           color: "var(--brand-pink)",
// //         }}
// //       >
// //         <RiDoubleQuotesL size={35} />
// //       </div>

// //       <p
// //         style={{
// //           fontSize: 15,
// //           fontWeight: "500",
// //           color: "var(--text-muted)",
// //           fontStyle: "oblique"
// //         }}
// //         className="line-clamp-3"
// //       >
// //         {quote}
// //       </p>
// //     </div>

// //     <div
// //       style={{
// //         display: "flex",
// //         alignItems: "center",
// //         gap: 8,
// //       }}
// //     >
// //       <div
// //         style={{
// //           width: "40px",
// //           height: "40px",
// //           borderRadius: "50%",
// //           overflow: "hidden",
// //         }}
// //       >
// //         <Image
// //           src={img}
// //           alt={name}
// //           style={{
// //             width: "100%",
// //             height: "100%",
// //             objectFit: "cover",
// //           }}
// //         />
// //       </div>

// //       <div>
// //         <div
// //           style={{
// //             fontWeight: 700,
// //             fontSize: 14,
// //             color: "#0f172a",
// //           }}
// //         >
// //           {name}
// //         </div>

// //         <div
// //           style={{
// //             fontSize: 13,
// //             fontWeight: "500",
// //             color: "#777b86",
// //           }}
// //         >
// //           {role}
// //         </div>
// //       </div>
// //     </div>
// //   </div >
// // }

// export default function TestimonialsSection() {

//   // const firstRow = TESTIMONIALS.slice(0, 5)
//   // const secondRow = TESTIMONIALS.slice(5, 10)
//   // const swiperRef1 = useRef(null)
//   // const swiperRef2 = useRef(null)

//   return (
//     <section
//       id="features"
//       className="features-part-home-page  w-full flex flex-col items-center justify-center gap-5"
//       style={{ background: "#", padding: "60px 0px" }}
//     >
//       <Container>
//         <div className="flex items-center flex-col w-full justify-center gap-6">
//           <div className="flex items-center flex-col w-full justify-center gap-2">
//             <div className="features_bnt">TESTIMONIALS</div>
//             <h2 className="features-h2-text text-center">Trusted by Growing Businesses</h2>
//             <p className="fw-semibold features-text-no-2 m-0">
//               See what our customers say
//             </p>
//           </div>
//         </div>
//       </Container>


//       <Container className="w-full" style={{ overflow: 'visible' }}>

//         <Swiper
//           modules={[Pagination, Autoplay]}
//           spaceBetween={12}
//           slidesPerView={3}
//           speed={2000}
//           pagination={{
//             clickable: true,
//           }}
//           autoplay={false}
//           breakpoints={{
//             0: {
//               slidesPerView: 1,
//             },
//             650: {
//               slidesPerView: 2,
//             },
//             1200: {
//               slidesPerView: 3,
//             },
//           }}
//           className="testimonial-swiper cursor-grab"
//         >
//           {TESTIMONIALS.map(({ quote, name, role, img }) => (
//             <SwiperSlide key={name}>
//               <div
//                 className="testimonials-boxes d-flex flex-column justify-content-between border border-[var(--border-light)] shadow-sm rounded-md"
//                 style={{
//                   background: "var(--bg-white)",
//                   padding: "15px 15px",
//                   height: "200px",
//                 }}
//               >
//                 <div className="flex items-start w-full gap-1 flex-col">
//                   <div
//                     style={{
//                       color: "var(--brand-blue)",
//                     }}
//                   >
//                     <RiDoubleQuotesL size={35} />
//                   </div>

//                   <p
//                     style={{
//                       fontSize: 15,
//                       fontWeight: "500",
//                       color: "var(--text-muted)",
//                       fontStyle: "oblique"
//                     }}
//                     className="line-clamp-3"
//                   >
//                     {quote}
//                   </p>
//                 </div>

//                 <div
//                   style={{
//                     display: "flex",
//                     alignItems: "center",
//                     gap: 8,
//                   }}
//                 >
//                   <div
//                     style={{
//                       width: "40px",
//                       height: "40px",
//                       borderRadius: "50%",
//                       overflow: "hidden",
//                     }}
//                   >
//                     <Image
//                       src={img}
//                       alt={name}
//                       style={{
//                         width: "100%",
//                         height: "100%",
//                         objectFit: "cover",
//                       }}
//                     />
//                   </div>

//                   <div>
//                     <div
//                       style={{
//                         fontWeight: 700,
//                         fontSize: 14,
//                         color: "#0f172a",
//                       }}
//                     >
//                       {name}
//                     </div>

//                     <div
//                       style={{
//                         fontSize: 13,
//                         fontWeight: "500",
//                         color: "#777b86",
//                       }}
//                     >
//                       {role}
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             </SwiperSlide>
//           ))}
//         </Swiper>
//       </Container>


//       {/* <>
//         <Swiper
//           onSwiper={(swiper) => {
//             swiperRef1.current = swiper;
//           }}
//           onMouseEnter={() => swiperRef1.current?.autoplay.stop()}
//           onMouseLeave={() => swiperRef1.current?.autoplay.start()}
//           className="w-full cursor-grab"
//           modules={[Autoplay]}
//           loop={true}
//           speed={5000}
//           spaceBetween={12}
//           allowTouchMove={false}
//           autoplay={{
//             delay: 0,
//             disableOnInteraction: false,
//             reverseDirection: false,
//           }}
//           breakpoints={{
//             0: { slidesPerView: 1 },
//             768: { slidesPerView: 2 },
//             1200: { slidesPerView: 3 },
//           }}
//         >
//           {firstRow.map((item) => (
//             <SwiperSlide key={item.name}>
//               <ReviewCard {...item} />
//             </SwiperSlide>
//           ))}
//         </Swiper>

//         <Swiper
//           onSwiper={(swiper) => {
//             swiperRef2.current = swiper;
//           }}
//           onMouseEnter={() => swiperRef2.current?.autoplay.stop()}
//           onMouseLeave={() => swiperRef2.current?.autoplay.start()}
//           className="w-full cursor-grab"
//           modules={[Autoplay]}
//           loop={true}
//           spaceBetween={12}
//           speed={5000}

//           allowTouchMove={false}
//           autoplay={{
//             delay: 0,
//             disableOnInteraction: false,
//             reverseDirection: true,
//           }}
//           breakpoints={{
//             0: { slidesPerView: 1 },
//             768: { slidesPerView: 2 },
//             1200: { slidesPerView: 3 },
//           }}
//         >
//           {secondRow.map((item) => (
//             <SwiperSlide key={item.name}>
//               <ReviewCard {...item} />
//             </SwiperSlide>
//           ))}
//         </Swiper>
//       </> */}


//     </section >
//   );
// }


'use client';

import Image, { StaticImageData } from 'next/image';
import Container from '../../components/ui/Conatiner';
import img_1 from '@/public/UI_Images/Profile.png';
import { RiDoubleQuotesL } from 'react-icons/ri';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Autoplay } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/pagination';

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  img: StaticImageData;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'Movent transformed how we manage clients. The leads pipeline alone saved us 10 hours a week.',
    name: 'Ahmed R.',
    role: 'CEO, TechCo',
    img: img_1,
  },
  {
    quote:
      'Best investment for our growing team. The project management module is incredibly intuitive.',
    name: 'Sara M.',
    role: 'Operations Manager, GrowthLab',
    img: img_1,
  },
  {
    quote:
      'The compliance module saved us so much time during our audits. Highly recommended.',
    name: 'Ali K.',
    role: 'Finance Manager, FinanceGroup',
    img: img_1,
  },
  {
    quote:
      'We replaced three different tools with Movent. Everything is now centralized and easier to manage.',
    name: 'Hassan A.',
    role: 'Founder, StartupHub',
    img: img_1,
  },
  {
    quote:
      'Invoice tracking and payment management have never been this simple. Our workflow is much faster now.',
    name: 'Fatima Z.',
    role: 'Accounts Head, VisionCorp',
    img: img_1,
  },
  {
    quote:
      'The HR and attendance modules helped us automate repetitive tasks and improve team productivity.',
    name: 'Usman T.',
    role: 'HR Manager, Nexa Solutions',
    img: img_1,
  },
  {
    quote:
      'Setup was quick and easy. Within a day our entire team was onboarded and actively using the platform.',
    name: 'Ayesha N.',
    role: 'Operations Lead, BrightWorks',
    img: img_1,
  },
  {
    quote:
      'The reporting dashboards provide clear insights into our business performance and growth metrics.',
    name: 'Bilal H.',
    role: 'Director, ScaleUp Inc.',
    img: img_1,
  },
  {
    quote:
      'Customer support is exceptional. The team helped us customize workflows exactly according to our needs.',
    name: 'Zain M.',
    role: 'Managing Director, AlphaTech',
    img: img_1,
  },
  {
    quote:
      'Movent gave us complete visibility over projects, invoices, and team performance in one place.',
    name: 'Mariam S.',
    role: 'Project Manager, InnovateX',
    img: img_1,
  },
];

export default function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      className="features-part-home-page w-full flex flex-col items-center justify-center gap-5"
      style={{
        background: '#',
        padding: '60px 0px',
      }}
    >
      <Container>
        <div className="flex items-center flex-col w-full justify-center gap-6">
          <div className="flex items-center flex-col w-full justify-center gap-2">
            <div className="features_bnt">
              TESTIMONIALS
            </div>

            <h2 className="features-h2-text text-center">
              Trusted by Growing Businesses
            </h2>

            <p className="fw-semibold features-text-no-2 m-0">
              See what our customers say
            </p>
          </div>
        </div>
      </Container>

      <Container
        className="w-full"
      >
        <Swiper
          modules={[Pagination, Autoplay]}
          spaceBetween={12}
          slidesPerView={3}
          speed={2000}
          pagination={{ clickable: true }}
          autoplay={false}
          breakpoints={{
            0: {
              slidesPerView: 1,
            },
            650: {
              slidesPerView: 2,
            },
            1200: {
              slidesPerView: 3,
            },
          }}
          className="testimonial-swiper cursor-grab"
        >
          {TESTIMONIALS.map(
            ({ quote, name, role, img }: Testimonial) => (
              <SwiperSlide key={name}>
                <div
                  className="testimonials-boxes d-flex flex-column justify-content-between border border-[var(--border-light)] shadow-sm rounded-md"
                  style={{
                    background: 'var(--bg-white)',
                    padding: '15px',
                    height: '200px',
                  }}
                >
                  <div className="flex items-start w-full gap-1 flex-col">
                    <div
                      style={{
                        color: 'var(--brand-blue)',
                      }}
                    >
                      <RiDoubleQuotesL size={35} />
                    </div>

                    <p
                      className="line-clamp-3"
                      style={{
                        fontSize: 15,
                        fontWeight: 500,
                        color: 'var(--text-muted)',
                        fontStyle: 'oblique',
                      }}
                    >
                      {quote}
                    </p>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        overflow: 'hidden',
                      }}
                    >
                      <Image
                        src={img}
                        alt={name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    </div>

                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: '#0f172a',
                        }}
                      >
                        {name}
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#777b86',
                        }}
                      >
                        {role}
                      </div>
                    </div>
                  </div>
                </div>
              </SwiperSlide>
            )
          )}
        </Swiper>
      </Container>
    </section>
  );
}
