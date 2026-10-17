# Jisr — MVP

## Vision

Jisr helps Moroccan students who have just finished high school discover realistic university options in Europe and understand what they need to do to study there.

The MVP should answer four questions:

1. **Where can I study?**
2. **Can I apply?**
3. **How much will it cost?**
4. **What do I need to do to get there?**

## Target User

- Moroccan high-school graduates
- Mainly looking for a Bachelor's degree
- Interested in studying in Europe
- May not know which country or university is realistic for their profile
- Needs clear information about costs, scholarships and applications

## MVP Scope

Start with a small number of countries and study fields rather than trying to cover all of Europe.

### Countries

- France
- Germany
- Netherlands

### Study Fields

- Computer Science
- Engineering
- Business / Economics

## Core User Journey

### 1. Create Your Profile

The profile holds eligibility only. The student enters:

- Nationality
- Bac type
- Bac grade
- Relevant subject grades
- French level
- English level

### 2. Get Matched Universities

Jisr shows universities and programs that appear compatible with the student's profile.

The student narrows the list with filters on My Matches: field of study, teaching language, destination country, public or private institutions, and an approximate yearly/monthly budget. Filters combine as AND across filters and any-of within one filter; an empty filter keeps everything open. The budget never hides a program — it only marks whether the published costs look within reach.

Each result should clearly show:

- University
- City
- Degree
- Language
- Tuition
- Estimated living cost
- Application deadline
- Main admission requirements
- Application method

Use simple statuses:

- ✅ Requirements appear satisfied
- ⚠️ Something needs to be checked
- ❌ Published requirements are not satisfied

### 3. University Details

For every program, provide one clear page containing:

- Program overview
- Admission requirements
- Tuition fees
- Estimated cost of living
- Application deadline
- Application procedure
- Required documents
- Available scholarships
- Official links
- Date when information was last verified

### 4. Scholarship Finder

Show scholarships that may be relevant to the student's profile.

For every scholarship:

- Who can apply
- Amount / type of support
- What it covers
- Deadline
- Requirements
- Required documents
- How to apply

### 5. Cost Calculator

Give students an estimated first-year cost including:

- Tuition
- Housing
- Food
- Transport
- Insurance
- Application / visa-related expenses
- Initial setup costs

The result should be presented as an estimate or range, not as an exact promise.

### 6. Personal Application Checklist

Once a student saves a university, Jisr creates a simple checklist:

- Prepare documents
- Translate documents if required
- Take language exam if required
- Create application account
- Submit application
- Apply for scholarships
- Prepare financial documents
- Arrange accommodation
- Prepare visa
- Prepare for departure

### 7. Compare Universities

Allow students to compare a few saved options side by side.

Compare:

- Tuition
- Living costs
- Language
- Requirements
- Deadline
- Scholarships
- Application procedure

## The Main Differentiator

Jisr should not feel like a normal university directory.

The experience should be:

**Student profile → realistic options → costs → scholarships → application steps**

Instead of making the student research everything themselves, Jisr organizes the information around their situation.

## Moroccan-Focused Features

These can make the MVP feel specifically designed for Moroccan students:

- Moroccan Bac eligibility information
- Country-specific application guidance
- Clear explanation of documents and translations
- French/Darija-friendly explanations
- Information about Moroccan-specific scholarship opportunities
- Practical information about studying abroad from Morocco
- Common mistakes Moroccan applicants should avoid

## Trust & Information

Every important piece of information should have:

- An official source
- A last-verified date

Jisr should clearly distinguish between:

- Official requirements
- Estimated costs
- General guidance

The goal is to make students trust the information enough to use Jisr as their starting point for the application process.

## MVP Pages

1. **Home**
2. **Create Profile**
3. **My Matches**
4. **University / Program Page**
5. **Scholarships**
6. **Compare**
7. **My Application Plan**

## MVP Success Metric

The MVP succeeds if a student can go from:

> "I want to study in Europe but I don't know where to start."

to:

> "I have several realistic university options, I know approximately how much they cost, I know which scholarships I may qualify for, and I know what I need to do next."

## What NOT to Build Yet

Avoid expanding the first version into:

- All European countries
- Every university and every degree
- Mobile apps
- Social networks
- Housing marketplaces
- Automatic university applications
- Complex AI features
- Massive rankings

Focus on making the core journey useful and trustworthy first.

## MVP Roadmap

### Phase 1 — Research

- Choose the exact countries and fields
- Identify the information students need most
- Collect a small set of reliable university and scholarship information

### Phase 2 — First Product

- Build the profile questionnaire
- Create the university results
- Create university detail pages
- Add scholarship information
- Add cost estimates

### Phase 3 — Personalized Journey

- Add saved universities
- Add comparison
- Add application checklist
- Add deadlines and next steps

### Phase 4 — Test With Real Students

Give the MVP to Moroccan students and observe:

- What they search for
- What they don't understand
- Which features they use
- Where they get stuck
- Whether they actually use the application checklist

### Phase 5 — Expand

After validating the concept:

- Add more universities
- Add more countries
- Add more study fields
- Improve scholarship matching
- Add more Moroccan-specific guidance
- Introduce more advanced personalization
