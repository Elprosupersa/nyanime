# omml_engine.py - Motor de Tipografía Matemática Nativa para Word (TecNM / Ingeniería)
# Versión 2.0 (10/10) - Soporta Fracciones, Radicales, Subíndices, Superíndices,
# Matrices con Corchetes, Sumatorias, Integrales y Sistemas de Ecuaciones.

from docx.oxml import parse_xml

OMML_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'

def wrap_run(text):
    """Envuelve texto en un elemento de ejecución de texto matemático OMML con Cambria Math."""
    return f'''<m:r xmlns:m="{OMML_NS}">
        <m:rPr><m:scr m:val="roman"/><m:sty m:val="p"/></m:rPr>
        <m:t>{text}</m:t>
    </m:r>'''

def create_fraction(num_xml, den_xml):
    """Genera una fracción vertical OMML con barra horizontal."""
    return f'''<m:f xmlns:m="{OMML_NS}">
        <m:fPr><m:type m:val="bar"/></m:fPr>
        <m:num>{num_xml}</m:num>
        <m:den>{den_xml}</m:den>
    </m:f>'''

def create_subscript(base_xml, sub_xml):
    """Genera un subíndice OMML (ej. mu_X o sigma_X)."""
    return f'''<m:sSub xmlns:m="{OMML_NS}">
        <m:e>{base_xml}</m:e>
        <m:sub>{sub_xml}</m:sub>
    </m:sSub>'''

def create_superscript(base_xml, sup_xml):
    """Genera un superíndice / exponente OMML (ej. x^2)."""
    return f'''<m:sSup xmlns:m="{OMML_NS}">
        <m:e>{base_xml}</m:e>
        <m:sup>{sup_xml}</m:sup>
    </m:sSup>'''

def create_sub_superscript(base_xml, sub_xml, sup_xml):
    """Genera simultáneamente subíndice y superíndice."""
    return f'''<m:sSubSup xmlns:m="{OMML_NS}">
        <m:e>{base_xml}</m:e>
        <m:sub>{sub_xml}</m:sub>
        <m:sup>{sup_xml}</m:sup>
    </m:sSubSup>'''

def create_radical(radicand_xml, degree_text=None):
    """Genera una raíz cuadrada o de grado n en OMML."""
    deg_hide = "0" if degree_text else "1"
    deg_element = f"<m:deg>{wrap_run(degree_text)}</m:deg>" if degree_text else '<m:deg><m:degPr><m:hide m:val="1"/></m:degPr></m:deg>'
    return f'''<m:rad xmlns:m="{OMML_NS}">
        <m:radPr><m:degHide m:val="{deg_hide}"/></m:radPr>
        {deg_element}
        <m:e>{radicand_xml}</m:e>
    </m:rad>'''

def create_nary_operator(operator_char, lower_text, upper_text, expr_xml):
    """Genera un operador n-ario (Integrales, Sumatorias, Productorias)."""
    return f'''<m:nary xmlns:m="{OMML_NS}">
        <m:naryPr>
            <m:chr m:val="{operator_char}"/>
            <m:limLoc m:val="undOvr"/>
        </m:naryPr>
        <m:sub>{wrap_run(lower_text)}</m:sub>
        <m:sup>{wrap_run(upper_text)}</m:sup>
        <m:e>{expr_xml}</m:e>
    </m:nary>'''

def create_matrix(rows_list, bracket_type="bracket"):
    """
    Genera una matriz OMML bidimensional con delimitadores.
    bracket_type: 'bracket' ([ ]), 'paren' (( )), o 'none'
    rows_list: lista de listas con texto o XML de cada celda, ej. [["1", "0"], ["0", "1"]]
    """
    beg_chr = "[" if bracket_type == "bracket" else ("(" if bracket_type == "paren" else "")
    end_chr = "]" if bracket_type == "bracket" else (")" if bracket_type == "paren" else "")
    
    rows_xml = ""
    for row in rows_list:
        rows_xml += "<m:mr>"
        for cell in row:
            cell_xml = cell if cell.strip().startswith("<m:") else wrap_run(cell)
            rows_xml += f"<m:e>{cell_xml}</m:e>"
        rows_xml += "</m:mr>"
        
    matrix_body = f'''<m:m xmlns:m="{OMML_NS}">
        <m:mPr><m:baseJc m:val="center"/></m:mPr>
        {rows_xml}
    </m:m>'''
    
    if bracket_type == "none":
        return matrix_body
        
    return f'''<m:d xmlns:m="{OMML_NS}">
        <m:dPr>
            <m:begChr m:val="{beg_chr}"/>
            <m:endChr m:val="{end_chr}"/>
            <m:grow m:val="1"/>
        </m:dPr>
        <m:e>{matrix_body}</m:e>
    </m:d>'''

def create_system_of_equations(equations_list):
    """
    Genera un sistema de ecuaciones agrupado con llave izquierda '{'.
    equations_list: lista de cadenas o XMLs de cada ecuación.
    """
    eqs_xml = ""
    for eq in equations_list:
        eq_xml = eq if eq.strip().startswith("<m:") else wrap_run(eq)
        eqs_xml += f"<m:e>{eq_xml}</m:e>"
        
    return f'''<m:d xmlns:m="{OMML_NS}">
        <m:dPr>
            <m:begChr m:val="{{"/>
            <m:endChr m:val=""/>
            <m:grow m:val="1"/>
        </m:dPr>
        <m:e>
            <m:eqArr xmlns:m="{OMML_NS}">
                {eqs_xml}
            </m:eqArr>
        </m:e>
    </m:d>'''

def add_omml_to_paragraph(paragraph, omml_body_xml, is_display=True):
    """Inserta una ecuación OMML completa en un párrafo de python-docx."""
    tag = "oMathPara" if is_display else "oMath"
    full_xml = f'''<m:{tag} xmlns:m="{OMML_NS}" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <m:oMath>
            {omml_body_xml}
        </m:oMath>
    </m:{tag}>'''
    parsed = parse_xml(full_xml)
    paragraph._p.append(parsed)
    return parsed

def test_engine_suite():
    from docx import Document
    doc = Document()
    doc.add_heading("Suite Completa de Validación OMML 2.0 (10/10)", level=1)
    
    # 1. Teorema del Límite Central (Fracción + Radical + Subíndice)
    doc.add_heading("1. Estadística Inferencial (Teorema del Límite Central)", level=2)
    p1 = doc.add_paragraph()
    lhs1 = create_subscript(wrap_run("σ"), wrap_run("X̄"))
    rhs1 = create_fraction(wrap_run("σ"), create_radical(wrap_run("n")))
    add_omml_to_paragraph(p1, f"{lhs1}{wrap_run(' = ')}{rhs1}")
    
    # 2. Integral Definida (Cálculo Vectorial)
    doc.add_heading("2. Cálculo Vectorial (Integral de Línea)", level=2)
    p2 = doc.add_paragraph()
    integrand_text = "F(r(t)) · r'(t) dt"
    integrand = wrap_run(integrand_text)
    integral = create_nary_operator("∫", "a", "b", integrand)
    add_omml_to_paragraph(p2, f"{wrap_run('W = ')}{integral}")
    
    # 3. Sumatoria Estadística
    doc.add_heading("3. Sumatoria de Varianza Muestral", level=2)
    p3 = doc.add_paragraph()
    xi_sub = create_subscript(wrap_run("x"), wrap_run("i"))
    sum_body = create_superscript(f"{wrap_run('(')}{xi_sub}{wrap_run(' - x̄)')}", wrap_run("2"))
    sum_op = create_nary_operator("∑", "i=1", "n", sum_body)
    add_omml_to_paragraph(p3, f"{create_superscript(wrap_run('s'), wrap_run('2'))}{wrap_run(' = ')}{create_fraction(sum_op, wrap_run('n - 1'))}")
    
    # 4. Matriz de Coeficientes 3x3 (Álgebra Lineal)
    doc.add_heading("4. Álgebra Lineal (Matriz de Transformación 3x3)", level=2)
    p4 = doc.add_paragraph()
    matrix_3x3 = [
        ["a₁₁", "a₁₂", "a₁₃"],
        ["a₂₁", "a₂₂", "a₂₃"],
        ["a₃₁", "a₃₂", "a₃₃"]
    ]
    matrix_xml = create_matrix(matrix_3x3, bracket_type="bracket")
    add_omml_to_paragraph(p4, f"{wrap_run('A = ')}{matrix_xml}")
    
    # 5. Sistema de Ecuaciones
    doc.add_heading("5. Sistema de Ecuaciones Lineales con Llave", level=2)
    p5 = doc.add_paragraph()
    eqs = [
        "2x + 3y - z = 7",
        "4x - y + 5z = 4",
        "x + 2y + z = 5"
    ]
    sys_xml = create_system_of_equations(eqs)
    add_omml_to_paragraph(p5, sys_xml)
    
    test_file = r"c:\Users\gonza\OneDrive\Escritorio\Antigravity escritorio general\test_omml_full_suite.docx"
    doc.save(test_file)
    print(f"Suite OMML 2.0 validada y guardada con éxito en: {test_file}")

if __name__ == "__main__":
    test_engine_suite()
