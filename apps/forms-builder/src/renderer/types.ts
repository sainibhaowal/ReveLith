export type FieldType =
  | 'group'
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'signature'
  | 'rating'
  | 'address'
  | 'phone'
  | 'url'
  | 'time'
  | 'currency'
  | 'yesno'
  | 'nps'
  | 'section'
  | 'pagebreak'
  | 'fullname'
  | 'date_range'
  | 'picture_choice'
  | 'country'
  | 'legal_terms'
  | 'input_table'
  | 'statement'
  | 'welcome'
  | 'thankyou'
  | 'hidden'

export interface FieldValidation {
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
  customMessage?: string
  allowOther?: boolean
  minSelections?: number
  maxSelections?: number
  accept?: string
  maxFileSizeMb?: number
  maxFiles?: number
  matchExpected?: boolean
  expectedAnswer?: string
  points?: number
}

export interface FormChoice {
  label: string
  imageUrl?: string
}

export interface FieldLayout {
  width: '25%' | '50%' | '75%' | '100%'
  mediaType?: 'image' | 'video'
  mediaUrl?: string
  backgroundColor?: string
  brightness?: number
  align?: 'inline' | 'float_left' | 'float_right' | 'split_left' | 'split_right' | 'cover'
}

export interface FormField {
  id: string
  type: FieldType
  label: string
  placeholder?: string
  helpText?: string
  required: boolean
  defaultValue?: unknown
  options?: string[]
  choiceImages?: Record<string, string>
  choiceColors?: Record<string, string>
  choiceIcons?: Record<string, string>
  optionLabels?: Record<string, string>
  choiceLayout?: 'vertical' | 'horizontal' | 'cards'
  correctAnswers?: string[]
  randomizeOptions?: boolean
  rows?: string[]
  columns?: string[]
  termsText?: string
  buttonText?: string
  children?: FormField[]
  scaleMin?: number
  scaleMax?: number
  sectionDescription?: string
  validation?: FieldValidation
  layout?: FieldLayout
  conditionalLogic?: {
    match?: 'all' | 'any'
    showWhen: {
      fieldId: string
      operator:
        | 'equals'
        | 'not_equals'
        | 'contains'
        | 'not_contains'
        | 'starts_with'
        | 'ends_with'
        | 'greater_than'
        | 'greater_or_equal_than'
        | 'less_than'
        | 'less_or_equal_than'
        | 'is_before'
        | 'is_after'
        | 'is_empty'
        | 'is_not_empty'
      value: string
    }[]
  }
}

export interface FormSettings {
  submitButtonText: string
  showProgressBar: boolean
  allowMultipleResponses: boolean
  collectEmail: boolean
  confirmationMessage: string
  redirectUrl?: string
  limitResponses?: number
  scheduleOpenAt?: string
  scheduleCloseAt?: string
  closedMessage?: string
  showQuestionNumbers?: boolean
  confirmationTitle?: string
  confirmationButtonText?: string
  closeOnLimit?: boolean
  locale?: string
  dateFormat?: string
  autosaveIntervalSeconds?: number
  navigationMode?: 'all-at-once' | 'one-at-a-time' | 'paged'
  showQuestionList?: boolean
  showNavigationArrows?: boolean
  timeLimitMinutes?: number
  showQuizScore?: boolean
}

export interface FormTheme {
  primaryColor: string
  backgroundColor: string
  fontFamily: string
  borderRadius?: number
  buttonStyle?: 'filled' | 'outlined' | 'text'
  contentWidth?: 'compact' | 'narrow' | 'standard' | 'wide' | 'full'
  questionSpacing?: 'tight' | 'compact' | 'comfortable' | 'relaxed' | 'spacious'
  labelPosition?: 'top' | 'left'
}

export type FormFieldTranslation = Partial<
  Pick<
    FormField,
    'label' | 'placeholder' | 'helpText' | 'sectionDescription' | 'buttonText' | 'termsText'
  >
> & { optionLabels?: Record<string, string> }

export interface FormTranslation {
  title?: string
  description?: string
  fields?: Record<string, FormFieldTranslation>
  settings?: Partial<
    Pick<
      FormSettings,
      | 'submitButtonText'
      | 'confirmationTitle'
      | 'confirmationMessage'
      | 'confirmationButtonText'
      | 'closedMessage'
    >
  >
}

export interface FormSchema {
  id: string
  title: string
  description: string
  fields: FormField[]
  variables?: FormVariable[]
  logicRules?: FormLogicRule[]
  translations?: Record<string, FormTranslation>
  settings: FormSettings
  theme: FormTheme
  createdAt?: string
  updatedAt?: string
  version?: number
}

export interface FormSubmission {
  id: string
  submittedAt: string
  answers: Record<string, unknown>
}

export interface FormVariable {
  id: string
  name: string
  type: 'string' | 'number'
  initialValue: string | number
}

export interface FormLogicCondition {
  fieldId: string
  operator: NonNullable<FormField['conditionalLogic']>['showWhen'][number]['operator']
  value: string
}

export type FormLogicAction =
  | { kind: 'navigate'; fieldId: string }
  | {
      kind: 'calculate'
      variableId: string
      operation: 'assign' | 'add' | 'subtract' | 'multiply' | 'divide'
      value?: number | string
      sourceFieldId?: string
    }

export interface FormLogicRule {
  id: string
  name: string
  conditions: FormLogicCondition[]
  match: 'all' | 'any'
  action: FormLogicAction
}

export type ViewMode = 'design' | 'preview'

export interface AiPreset {
  text: string
  displayText?: string
  nonce: number
}
