from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor

def add_title_slide(prs, title, subtitle):
    slide_layout = prs.slide_layouts[0]
    slide = prs.slides.add_slide(slide_layout)
    title_box = slide.shapes.title
    subtitle_box = slide.placeholders[1]
    
    title_box.text = title
    subtitle_box.text = subtitle

def add_content_slide(prs, title, bullet_points):
    slide_layout = prs.slide_layouts[1]
    slide = prs.slides.add_slide(slide_layout)
    
    title_shape = slide.shapes.title
    title_shape.text = title
    
    body_shape = slide.shapes.placeholders[1]
    tf = body_shape.text_frame
    
    for i, point in enumerate(bullet_points):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = point
        p.level = 0
        p.font.size = Pt(20)

def add_image_slide(prs, title, image_path):
    slide_layout = prs.slide_layouts[5] # blank slide with title
    slide = prs.slides.add_slide(slide_layout)
    
    title_shape = slide.shapes.title
    title_shape.text = title
    
    # Add image, centered and scaled
    left = Inches(1)
    top = Inches(2)
    height = Inches(4.5)
    slide.shapes.add_picture(image_path, left, top, height=height)

def main():
    prs = Presentation()
    
    # Slide 1: Title
    add_title_slide(prs, 
                    "BioInsight 360", 
                    "Frontend & UI/UX Development\nProgress Report")
    
    # Slide 2: Screenshot
    try:
        add_image_slide(prs, "BioInsight 360 - Frontend Interface", "landing.jpg")
    except Exception as e:
        print(f"Could not add image: {e}")
    
    # Slide 3: The Problem
    add_content_slide(prs, 
                      "Project Vision & Goals", 
                      [
                          "Goal: To build a browser-based, privacy-first, multi-method consensus RNA-Seq analysis platform.",
                          "Current Challenge: Existing tools have outdated interfaces and require complex programming setups.",
                          "Our Approach: Start by building a modern, highly interactive, and responsive web interface that researchers actually enjoy using."
                      ])
                      
    # Slide 4: Frontend Achievements
    add_content_slide(prs, 
                      "Frontend Development: 100% Complete", 
                      [
                          "Modern Tech Stack: Built using Next.js and React for lightning-fast performance.",
                          "Responsive Design: UI scales perfectly across laptops, desktops, and large monitors.",
                          "Glassmorphism Aesthetics: Implemented a premium, modern design language with custom CSS.",
                          "Client-Side Architecture: Fully established the framework to handle everything entirely in the browser for maximum privacy."
                      ])
                      
    # Slide 5: Key UI Components Built
    add_content_slide(prs, 
                      "Key Pages & UI Components Completed", 
                      [
                          "Landing Page: Welcoming interface with clear navigation and project overview.",
                          "Data Upload Portal: Drag-and-drop interface ready to accept CSV/TSV and .gz files.",
                          "Interactive Dashboards: Built the UI shells for Quality Control, Consensus Analysis, and Pathway Analysis.",
                          "Visualization Containers: Setup responsive grids and cards to host future Plotly.js charts (Volcano plots, Heatmaps)."
                      ])
                      
    # Slide 6: Routing & State Management
    add_content_slide(prs, 
                      "Routing & Data Flow Framework", 
                      [
                          "Seamless Navigation: Users can transition between Upload -> QC -> Consensus without page reloads.",
                          "Session Management: Implemented Next.js routing and browser SessionStorage limits.",
                          "Error Handling UI: Built loading spinners, error banners, and success toasts to guide the user experience.",
                          "Next Steps involve connecting the raw data processing logic into these completed UI components."
                      ])
                      
    # Slide 7: Next Steps
    add_content_slide(prs, 
                      "Upcoming Milestones (Next Phase)", 
                      [
                          "Now that the complete Frontend shell is built, we are moving to the computational phase:",
                          "  - Integrate the Statistical Engine (Welch's & Mann-Whitney U tests).",
                          "  - Implement the JavaScript Math Algorithms for PCA and Normalizations.",
                          "  - Connect the Consensus Logic to the UI Dashboards.",
                          "  - Finalize interactive chart rendering with real datasets."
                      ])
                      
    prs.save("BioInsight360_Frontend_Report.pptx")
    print("Presentation saved as BioInsight360_Frontend_Report.pptx")

if __name__ == "__main__":
    main()
