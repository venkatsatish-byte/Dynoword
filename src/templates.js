const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export const TEMPLATES = {
  blank: { title: 'Untitled document', html: () => '<p></p>' },

  letter: {
    title: 'Letter',
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
    html: () => `
      <h1 class="doc-title" style="text-align:center">Your Name</h1>
      <p style="text-align:center">City, State · (555) 555-5555 · you@example.com · linkedin.com/in/you</p>
      <h2>Summary</h2>
      <p>Two or three sentences about who you are, what you do best and what you are looking for.</p>
      <h2>Experience</h2>
      <h3>Job Title — Company</h3>
      <p><em>Month 20XX – Present · City, State</em></p>
      <ul><li><p>Describe an accomplishment with a measurable result.</p></li><li><p>Describe a responsibility and its impact.</p></li></ul>
      <h3>Job Title — Company</h3>
      <p><em>Month 20XX – Month 20XX · City, State</em></p>
      <ul><li><p>Describe an accomplishment with a measurable result.</p></li></ul>
      <h2>Education</h2>
      <p><strong>Degree, Field of Study</strong> — University, 20XX</p>
      <h2>Skills</h2>
      <p>Skill · Skill · Skill · Skill · Skill</p>`,
  },

  report: {
    title: 'Report',
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
