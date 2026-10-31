const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

// A line with text on the left and text (usually dates) right-aligned on a tab stop at the right margin.
const split = (left, right, extra = '') => `<p data-tabs='[{"pos":6.5,"align":"right"}]'${extra}>${left}<span data-tab></span>${right}</p>`;
const ul = (...items) => `<ul>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ul>`;
const ruled = (text) => `<h2 data-border="bottom">${text}</h2>`;

/*
 * Each template has a document title, a gallery label, a group ('doc' or 'resume'),
 * an optional one-line description, and an html() function.
 */

export const TEMPLATES = {
  blank: { title: 'Untitled document', label: 'Blank document', group: 'doc', html: () => '<p></p>' },

  letter: {
    title: 'Letter',
    label: 'Letter',
    group: 'doc',
    html: () => `
      <p>Your Name<br>123 Street Address<br>City, State 00000<br>you@example.com</p>
      <p>${today()}</p>
      <p>Recipient Name<br>Title<br>Company<br>Street Address<br>City, State 00000</p>
      <p>Dear Recipient Name,</p>
      <p>Start your letter here. Use this first paragraph to say why you are writing.</p>
      <p>Use the middle paragraphs to give details, background and anything the reader needs to know.</p>
      <p>Close by thanking the reader and stating any next steps.</p>
      <p>Sincerely,</p>
      <p><br>Your Name</p>`,
  },

  resume: {
    title: 'Resume',
    label: 'Classic',
    group: 'resume',
    blurb: 'Centred name, job-by-job experience',
    html: () => `
      <h1 class="doc-title" style="text-align:center">Your Name</h1>
      <p style="text-align:center">City, State · (555) 555-5555 · you@example.com · linkedin.com/in/you</p>
      <h2>Summary</h2>
      <p>Two or three sentences about who you are, what you do best and what you are looking for.</p>
      <h2>Experience</h2>
      <h3>Job Title — Company</h3>
      <p><em>Jan 2021 – Present · City, State</em></p>
      <ul><li><p>Describe an accomplishment with a measurable result.</p></li><li><p>Describe a responsibility and its impact.</p></li></ul>
      <h3>Job Title — Company</h3>
      <p><em>Jun 2017 – Dec 2020 · City, State</em></p>
      <ul><li><p>Describe an accomplishment with a measurable result.</p></li></ul>
      <h2>Education</h2>
      <p><strong>Degree, Field of Study</strong> — University, 2017</p>
      <h2>Skills</h2>
      <p>Skill · Skill · Skill · Skill · Skill</p>`,
  },

  atsResume: {
    title: 'ATS Resume',
    label: 'ATS standard',
    group: 'resume',
    blurb: 'Plain layout that every ATS reads cleanly',
    html: () => `
      <h1 class="doc-title">First Last</h1>
      <p>City, State · (555) 555-5555 · first.last@example.com · linkedin.com/in/firstlast</p>
      <h2>Professional Summary</h2>
      <p>Results-driven [job title] with [X] years of experience in [field]. Skilled in [skill], [skill] and [skill]. Known for [a measurable achievement]. Use words from the job posting where they truly apply.</p>
      <h2>Skills</h2>
      <ul><li><p>Skill, Skill, Skill, Skill</p></li><li><p>Tool, Tool, Tool, Tool</p></li><li><p>Certification or language</p></li></ul>
      <h2>Work Experience</h2>
      <h3>Job Title</h3>
      <p><strong>Company Name</strong> — City, State | Jan 2021 – Present</p>
      <ul>
        <li><p>Start with an action verb and end with a result, e.g. “Cut processing time 30% by automating …”.</p></li>
        <li><p>Quantify impact: revenue, savings, percentages, people, time.</p></li>
        <li><p>Mirror important keywords from the job description.</p></li>
      </ul>
      <h3>Job Title</h3>
      <p><strong>Company Name</strong> — City, State | Jun 2018 – Dec 2020</p>
      <ul><li><p>Achievement with a measurable result.</p></li><li><p>Achievement with a measurable result.</p></li></ul>
      <h2>Education</h2>
      <p><strong>Degree, Field of Study</strong> — University Name, City, State | 2018</p>
      <h2>Certifications</h2>
      <ul><li><p>Certification Name — Issuing Organization, 2022</p></li></ul>`,
  },

  modernResume: {
    title: 'Resume',
    label: 'Modern',
    group: 'resume',
    blurb: 'Ruled section headings, dates aligned right',
    html: () => `
      <h1 class="doc-title" style="text-align:center">Alex Morgan</h1>
      <p style="text-align:center">Product Manager · Seattle, WA · (555) 555-0142 · alex.morgan@example.com · linkedin.com/in/alexmorgan</p>
      ${ruled('Summary')}
      <p>Product manager with 7 years of experience shipping B2B SaaS products used by 2M+ people. Turns customer research and data into roadmaps that grow revenue and retention.</p>
      ${ruled('Experience')}
      ${split('<strong>Senior Product Manager</strong>, Northwind Software', 'Mar 2021 – Present')}
      ${ul('Led a team of 9 engineers and 2 designers to launch self-serve onboarding, cutting time-to-value from 14 days to 3.',
        'Grew annual recurring revenue by $4.2M (18%) by introducing usage-based pricing tiers.',
        'Ran 40+ customer interviews per quarter and turned the findings into a prioritised roadmap.')}
      ${split('<strong>Product Manager</strong>, Contoso Labs', 'Jun 2018 – Feb 2021')}
      ${ul('Owned the analytics dashboard used by 300 enterprise customers; raised weekly active use 35%.',
        'Introduced quarterly OKRs and a shared experiment backlog across three teams.')}
      ${ruled('Education')}
      ${split('<strong>B.S., Business Administration</strong>, University of Washington', '2018')}
      ${ruled('Skills')}
      <p>Product strategy · Roadmapping · A/B testing · SQL · Amplitude · Jira · Figma · Stakeholder management</p>
      ${ruled('Certifications')}
      <p>Certified Scrum Product Owner (CSPO), 2020</p>`,
  },

  entryResume: {
    title: 'Resume',
    label: 'Student / entry-level',
    group: 'resume',
    blurb: 'Education and projects first, for new graduates',
    html: () => `
      <h1 class="doc-title">Jordan Lee</h1>
      <p>Austin, TX · (555) 555-0187 · jordan.lee@example.com · linkedin.com/in/jordanlee · github.com/jordanlee</p>
      <h2>Objective</h2>
      <p>Graduating marketing student seeking an entry-level digital marketing role where I can apply data analysis, content creation and campaign experience.</p>
      <h2>Education</h2>
      ${split('<strong>B.A., Marketing</strong> — University of Texas at Austin', 'May 2025')}
      ${ul('GPA 3.7/4.0 · Dean’s List (6 semesters)', 'Relevant coursework: Consumer Behavior, Marketing Analytics, Digital Advertising, Statistics')}
      <h2>Internship Experience</h2>
      ${split('<strong>Marketing Intern</strong>, BrightPath Media', 'Jun 2024 – Aug 2024')}
      ${ul('Wrote and scheduled 60+ social posts, growing Instagram engagement 22% over the summer.',
        'Built a weekly campaign report in Google Sheets that the team still uses.')}
      <h2>Projects</h2>
      ${split('<strong>Campus Food Bank Awareness Campaign</strong>', 'Spring 2024')}
      ${ul('Planned a four-week email and social campaign that raised donations 40% compared with the previous term.')}
      <h2>Skills</h2>
      ${ul('Marketing: SEO, email marketing, social media, copywriting', 'Tools: Google Analytics, Canva, HubSpot, Excel', 'Languages: English (native), Spanish (conversational)')}
      <h2>Activities</h2>
      ${ul('Vice President, Marketing Club — organised 8 industry speaker events', 'Volunteer, Austin Food Bank — 120 hours')}`,
  },

  techResume: {
    title: 'Software Engineer Resume',
    label: 'Software engineer',
    group: 'resume',
    blurb: 'Grouped technical skills, projects with links',
    html: () => `
      <h1 class="doc-title">Sam Patel</h1>
      <p>San Francisco, CA · (555) 555-0123 · sam.patel@example.com · github.com/sampatel · sampatel.dev</p>
      ${ruled('Technical Skills')}
      <p><strong>Languages:</strong> TypeScript, Python, Go, SQL</p>
      <p><strong>Frameworks:</strong> React, Node.js, Django, gRPC</p>
      <p><strong>Cloud &amp; tools:</strong> AWS (Lambda, ECS, DynamoDB), Docker, Kubernetes, Terraform, GitHub Actions, PostgreSQL</p>
      ${ruled('Experience')}
      ${split('<strong>Software Engineer II</strong>, Fabrikam Payments', 'Jan 2022 – Present')}
      ${ul('Designed an idempotent payment retry service in Go handling 5M requests/day at 99.99% availability.',
        'Cut p95 checkout latency from 820 ms to 310 ms by caching risk scores and batching database writes.',
        'Mentored 3 new engineers and led the team’s move from Jenkins to GitHub Actions, halving build times.')}
      ${split('<strong>Software Engineer</strong>, Tailspin Analytics', 'Jul 2019 – Dec 2021')}
      ${ul('Built React dashboards and a Django REST API used by 1,200 customers.',
        'Added end-to-end tests that reduced production incidents 45% year over year.')}
      ${ruled('Projects')}
      ${split('<strong>OpenQueue</strong> — open-source Node.js job queue', '2023')}
      ${ul('1.8k GitHub stars; supports Redis and PostgreSQL back ends with exactly-once delivery (github.com/sampatel/openqueue).')}
      ${ruled('Education')}
      ${split('<strong>B.S., Computer Science</strong> — University of California, Davis', '2019')}
      ${ruled('Certifications')}
      <p>AWS Certified Solutions Architect – Associate, 2023</p>`,
  },

  careerChangeResume: {
    title: 'Resume',
    label: 'Career change',
    group: 'resume',
    blurb: 'Leads with transferable skills',
    html: () => `
      <h1 class="doc-title">Taylor Brooks</h1>
      <p>Denver, CO · (555) 555-0199 · taylor.brooks@example.com · linkedin.com/in/taylorbrooks</p>
      <h2>Professional Summary</h2>
      <p>Former high-school teacher moving into instructional design. 8 years of designing curricula, coaching adults and measuring learning outcomes, plus a certificate in e-learning development.</p>
      <h2>Transferable Skills</h2>
      <h3>Curriculum and course design</h3>
      ${ul('Designed 12 semester-long courses aligned to state standards and learning objectives.', 'Created assessments that raised pass rates from 71% to 88%.')}
      <h3>Training and facilitation</h3>
      ${ul('Led 30+ professional-development workshops for teachers and staff.', 'Coached 6 new teachers through their first year.')}
      <h3>Digital learning tools</h3>
      ${ul('Built blended courses in Canvas and Google Classroom used by 400 students.', 'Produced short video lessons with Camtasia and Articulate Rise.')}
      <h2>Professional Experience</h2>
      ${split('<strong>Science Teacher</strong>, Lakewood High School', 'Aug 2016 – Jun 2024')}
      ${ul('Taught biology and chemistry to 150 students a year; department lead for 3 years.')}
      ${split('<strong>Freelance Instructional Designer</strong>', 'Jan 2024 – Present')}
      ${ul('Designed a 6-module onboarding course for a 200-person logistics company.')}
      <h2>Education and Training</h2>
      ${split('<strong>Certificate, E-Learning Instructional Design</strong> — University of Denver', '2024')}
      ${split('<strong>B.S., Biology</strong> — Colorado State University', '2016')}
      <h2>Skills</h2>
      <p>ADDIE · Articulate Storyline and Rise · Canvas LMS · Camtasia · Needs analysis · Learning assessment</p>`,
  },

  executiveResume: {
    title: 'Executive Resume',
    label: 'Executive',
    group: 'resume',
    blurb: 'Executive summary, competencies, highlights',
    html: () => `
      <h1 class="doc-title" style="text-align:center">Morgan Ellis</h1>
      <p style="text-align:center">Chief Operating Officer · Chicago, IL · (555) 555-0110 · morgan.ellis@example.com · linkedin.com/in/morganellis</p>
      ${ruled('Executive Summary')}
      <p>Operations executive with 18 years of experience scaling manufacturing and logistics businesses from $80M to $1.2B in revenue. Known for building high-performing teams, disciplined execution and turnarounds that deliver lasting margin gains.</p>
      ${ruled('Core Competencies')}
      <p>P&amp;L leadership · Operational excellence · M&amp;A integration · Supply chain strategy · Lean / Six Sigma · Board relations · Change management · Capital planning</p>
      ${ruled('Career Highlights')}
      ${ul('Raised EBITDA margin from 9% to 16% in three years while growing revenue 2.4×.',
        'Integrated four acquisitions worth $310M, delivering $45M in annual synergies ahead of plan.',
        'Built a leadership bench of 25 directors; 80% of senior openings now filled internally.')}
      ${ruled('Professional Experience')}
      ${split('<strong>Chief Operating Officer</strong>, Adventure Works Manufacturing', '2019 – Present')}
      <p><em>Lead 3,400 employees across 11 plants and 4 distribution centres; $1.2B revenue.</em></p>
      ${ul('Led the post-pandemic supply-chain redesign, cutting stock-outs 60% and freight cost 18%.',
        'Launched an operating system of daily performance reviews adopted company-wide.')}
      ${split('<strong>Vice President, Operations</strong>, Litware Industrial', '2012 – 2019')}
      ${ul('Turned around two loss-making plants within 18 months; both profitable since 2015.')}
      ${ruled('Education')}
      ${split('<strong>MBA</strong> — Northwestern University (Kellogg)', '2011')}
      ${split('<strong>B.S., Industrial Engineering</strong> — Purdue University', '2005')}
      ${ruled('Board and Affiliations')}
      ${ul('Board Director, Midwest Manufacturing Council (2021 – present)', 'Advisory Board, Purdue School of Industrial Engineering')}`,
  },

  academicCv: {
    title: 'Curriculum Vitae',
    label: 'Academic CV',
    group: 'resume',
    blurb: 'Research, publications, teaching, grants',
    html: () => `
      <h1 class="doc-title">Dr. Riley Chen</h1>
      <p>Assistant Professor of Environmental Science · Department of Earth Sciences, Example University · (555) 555-0175 · riley.chen@example.edu · ORCID 0000-0000-0000-0000</p>
      <h2>Research Interests</h2>
      <p>Urban hydrology, climate adaptation, green infrastructure, remote sensing of water quality.</p>
      <h2>Education</h2>
      ${split('<strong>Ph.D., Environmental Engineering</strong> — University of Michigan', '2019')}
      <p>Dissertation: “Modelling stormwater retention in urban green roofs.” Advisor: Prof. A. Smith</p>
      ${split('<strong>M.S., Civil Engineering</strong> — Georgia Institute of Technology', '2015')}
      ${split('<strong>B.S., Environmental Science</strong> — University of Florida', '2013')}
      <h2>Academic Appointments</h2>
      ${split('<strong>Assistant Professor</strong>, Example University', '2021 – Present')}
      ${split('<strong>Postdoctoral Researcher</strong>, Stanford University', '2019 – 2021')}
      <h2>Publications</h2>
      <ol>
        <li><p>Chen, R., &amp; Smith, A. (2023). Green roof retention under extreme rainfall. <em>Water Resources Research</em>, 59(4), e2022WR033.</p></li>
        <li><p>Chen, R., Garcia, M., &amp; Lee, K. (2021). Satellite estimates of urban lake turbidity. <em>Remote Sensing of Environment</em>, 254, 112–125.</p></li>
      </ol>
      <h2>Grants and Awards</h2>
      ${ul('National Science Foundation CAREER Award, $550,000 (2024 – 2029)', 'Best Paper Award, American Water Resources Association (2022)')}
      <h2>Teaching Experience</h2>
      ${ul('ENVS 210: Introduction to Hydrology (undergraduate, 120 students, 2021 – present)', 'ENVS 540: Urban Water Systems (graduate seminar, 2022 – present)')}
      <h2>Presentations</h2>
      ${ul('“Designing cities for 100-year storms,” AGU Fall Meeting, San Francisco, 2023 (invited)')}
      <h2>Skills</h2>
      <p>Python · R · ArcGIS · SWMM · Google Earth Engine · Field sampling and lab analysis</p>
      <h2>References</h2>
      <p>Available on request.</p>`,
  },

  creativeResume: {
    title: 'Resume',
    label: 'Designer / creative',
    group: 'resume',
    blurb: 'Portfolio link up front, selected projects',
    html: () => `
      <h1 class="doc-title">Casey Rivera</h1>
      <p><strong>UX / Visual Designer</strong> · Brooklyn, NY · (555) 555-0166 · casey@example.com</p>
      <p>Portfolio: caseyrivera.design · linkedin.com/in/caseyrivera</p>
      ${ruled('Profile')}
      <p>Designer with 6 years of experience creating brand systems and accessible product interfaces for consumer apps. Pairs strong visual craft with research and measurable outcomes.</p>
      ${ruled('Skills')}
      ${ul('Design: UX research, interaction design, design systems, typography, branding, accessibility (WCAG 2.2)',
        'Tools: Figma, Adobe Illustrator, Photoshop, After Effects, Webflow, HTML/CSS')}
      ${ruled('Experience')}
      ${split('<strong>Senior Product Designer</strong>, Wingtip Apps', 'Apr 2021 – Present')}
      ${ul('Redesigned the checkout flow, lifting mobile conversion 12% across 1.5M monthly users.',
        'Built and maintain a 300-component Figma design system used by 5 product teams.')}
      ${split('<strong>Visual Designer</strong>, Blue Yonder Studio', 'Aug 2018 – Mar 2021')}
      ${ul('Created brand identities for 20+ clients in food, retail and non-profit sectors.')}
      ${ruled('Selected Projects')}
      ${ul('Parks NYC app — volunteer redesign that raised event sign-ups 30% (Webby honoree, 2023)',
        'Rebrand for Greenleaf Grocers — logo, packaging and signage across 14 stores')}
      ${ruled('Education')}
      ${split('<strong>B.F.A., Communication Design</strong> — Pratt Institute', '2018')}`,
  },

  coverLetter: {
    title: 'Cover Letter',
    label: 'Cover letter',
    group: 'resume',
    blurb: 'Matches any résumé; three short paragraphs',
    html: () => `
      <h1 class="doc-title">Your Name</h1>
      <p>City, State · (555) 555-5555 · you@example.com · linkedin.com/in/you</p>
      <p>${today()}</p>
      <p>Hiring Manager<br>Company Name<br>City, State</p>
      <p>Dear Hiring Manager,</p>
      <p>I am excited to apply for the [Job Title] role at [Company]. With [X] years of experience in [field] and a track record of [key achievement], I would bring [specific strength] to your team.</p>
      <p>In my current role at [Company], I [accomplishment with a number]. I also [second accomplishment that matches the job description]. These experiences have prepared me to [what you would do in the new role].</p>
      <p>I admire [something specific about the company] and would welcome the chance to discuss how I can help [team or goal]. Thank you for your time and consideration.</p>
      <p>Sincerely,</p>
      <p>Your Name</p>`,
  },

  report: {
    title: 'Report',
    label: 'Report',
    group: 'doc',
    html: () => `
      <h1 class="doc-title">Report Title</h1>
      <p><em>Prepared by Your Name · ${today()}</em></p>
      <h1>Executive summary</h1>
      <p>Summarise the purpose, key findings and recommendations in one or two paragraphs.</p>
      <h1>Background</h1>
      <p>Explain the context and why this report matters.</p>
      <h1>Findings</h1>
      <h2>Finding one</h2>
      <p>Describe the first finding.</p>
      <table><tbody>
        <tr><th><p>Metric</p></th><th><p>Q1</p></th><th><p>Q2</p></th><th><p>Change</p></th></tr>
        <tr><td><p>Revenue</p></td><td><p>0</p></td><td><p>0</p></td><td><p>0%</p></td></tr>
        <tr><td><p>Customers</p></td><td><p>0</p></td><td><p>0</p></td><td><p>0%</p></td></tr>
      </tbody></table>
      <h2>Finding two</h2>
      <p>Describe the second finding.</p>
      <h1>Recommendations</h1>
      <ol><li><p>First recommendation.</p></li><li><p>Second recommendation.</p></li></ol>`,
  },

  notes: {
    title: 'Meeting notes',
    label: 'Meeting notes',
    group: 'doc',
    html: () => `
      <h1>Meeting notes</h1>
      <p><strong>Date:</strong> ${today()}<br><strong>Attendees:</strong> </p>
      <h2>Agenda</h2>
      <ol><li><p>Topic one</p></li><li><p>Topic two</p></li></ol>
      <h2>Notes</h2>
      <ul><li><p></p></li></ul>
      <h2>Action items</h2>
      <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Owner — task — due date</p></li></ul>`,
  },
};
